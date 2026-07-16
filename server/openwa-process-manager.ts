import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { checkOpenWaHealth } from "../lib/openwa-health";
import { runtimeConfig, saveRuntimeConfig } from "../lib/runtime-config";

type Launch = { executable: string; args: string[]; cwd: string };
export type OpenWaManagerConfig = { autoStart: boolean; workingDirectory: string; startCommand: string; baseUrl: string; port: string; apiKey?: string; browserExecutable?: string };
type ManagerOptions = {
  development: boolean;
  projectRoot?: string;
  maxStartAttempts?: number;
  maxCrashRestarts?: number;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
  loadConfig?: () => Promise<OpenWaManagerConfig>;
  healthCheck?: (config: { baseUrl: string; port: string; timeoutMs?: number }) => Promise<boolean>;
  saveDetectedDirectory?: (directory: string) => Promise<void>;
  saveDetectedBrowser?: (executable: string) => Promise<void>;
};

const sleep = (ms: number) => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

function isolatedChildEnvironment(): NodeJS.ProcessEnv {
  const allowed = new Set([
    "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "HOME",
    "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "NODE_ENV", "TZ", "LANG", "LC_ALL",
  ]);
  const environment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "development" };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && allowed.has(key.toUpperCase())) environment[key] = value;
  }
  return environment;
}

function enabled(value: string) {
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

function parseCommand(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== "string")) throw new Error("OPENWA_START_COMMAND must be a command or a JSON string array");
    return parsed;
  }
  const parts: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  for (const match of trimmed.matchAll(pattern)) parts.push(match[1] ?? match[2] ?? match[3]);
  return parts;
}

async function exists(path: string) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function npmLaunch(parts: string[], cwd: string): Promise<Launch> {
  if (process.platform !== "win32") return { executable: parts[0], args: parts.slice(1), cwd };
  const candidates = [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const npmCli = candidates.find(candidate => require("node:fs").existsSync(candidate));
  if (!npmCli) throw new Error("npm CLI could not be located for the configured OpenWA command");
  return { executable: process.execPath, args: [npmCli, ...parts.slice(1)], cwd };
}

export class OpenWaProcessManager {
  private child: ChildProcess | null = null;
  private stopping = false;
  private starting = false;
  private ownsLock = false;
  private lastError = "";
  private stderrTail = "";
  private crashRestarts: number[] = [];
  private readonly projectRoot: string;
  private readonly lockPath: string;
  private readonly maxStartAttempts: number;
  private readonly maxCrashRestarts: number;
  private readonly readyTimeoutMs: number;
  private readonly stopTimeoutMs: number;

  constructor(private readonly options: ManagerOptions) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.lockPath = join(this.projectRoot, "data", "openwa-manager.lock");
    this.maxStartAttempts = options.maxStartAttempts ?? 3;
    this.maxCrashRestarts = options.maxCrashRestarts ?? 3;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 45_000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 8000;
  }

  get pid() { return this.child?.pid ?? null; }
  get startupError() { return this.lastError; }

  async start() {
    this.stopping = false;
    if (this.starting) return false;
    const config = await this.loadConfig();
    if (await this.isHealthy(config.baseUrl, config.port)) {
      console.log("[OpenWA] Ready (reusing existing service)");
      return true;
    }
    if (!config.autoStart) {
      console.log("[OpenWA] Auto-start disabled; service unavailable");
      return false;
    }

    const cwd = await this.resolveWorkingDirectory(config.workingDirectory);
    if (!cwd) {
      this.lastError = "OpenWA installation directory was not found";
      console.error("[OpenWA] Failed to start: installation directory is not configured or could not be detected");
      return false;
    }
    const launch = await this.resolveLaunch(cwd, config.startCommand);
    if (!launch) {
      this.lastError = "OpenWA startup command could not be resolved";
      console.error("[OpenWA] Failed to start: startup command is unavailable");
      return false;
    }
    const browserExecutable = await this.resolveBrowserExecutable(config.browserExecutable || "");
    if (!(await this.acquireLock(config.baseUrl, config.port))) return this.isHealthy(config.baseUrl, config.port);

    this.starting = true;
    try {
      for (let attempt = 1; attempt <= this.maxStartAttempts; attempt++) {
        if (this.stopping) break;
        console.log(attempt === 1 ? "[OpenWA] Starting..." : `[OpenWA] Restarting... (${attempt}/${this.maxStartAttempts})`);
        try {
          await this.spawnChild(launch, config.port, config.apiKey, browserExecutable);
          if (await this.waitUntilReady(config.baseUrl, config.port, this.readyTimeoutMs)) {
            console.log("[OpenWA] Ready");
            this.lastError = "";
            return true;
          }
          this.lastError = this.stderrTail ? "OpenWA exited or did not become healthy" : "OpenWA health check timed out";
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : "OpenWA failed to start";
        }
        await this.terminateOwnedChild();
        if (this.stopping) break;
        if (attempt < this.maxStartAttempts) await sleep(attempt * 1500);
      }
      if (!this.stopping) console.error("[OpenWA] Failed to start after bounded retries");
      await this.releaseLock();
      return false;
    } finally {
      this.starting = false;
    }
  }

  async restart() {
    await this.stop();
    this.stopping = false;
    return this.start();
  }

  async stop() {
    this.stopping = true;
    await this.terminateOwnedChild();
    await this.releaseLock();
    console.log("[OpenWA] Stopped");
  }

  private async loadConfig() {
    if (this.options.loadConfig) return this.options.loadConfig();
    const [autoStart, workingDirectory, startCommand, baseUrl, port, apiKey, browserExecutable] = await Promise.all([
      runtimeConfig("OPENWA_AUTO_START"), runtimeConfig("OPENWA_WORKING_DIRECTORY"), runtimeConfig("OPENWA_START_COMMAND"),
      runtimeConfig("OPENWA_BASE_URL"), runtimeConfig("OPENWA_PORT"), runtimeConfig("OPENWA_API_KEY"), runtimeConfig("OPENWA_BROWSER_EXECUTABLE"),
    ]);
    return { autoStart: enabled(autoStart || "true"), workingDirectory: workingDirectory.trim(), startCommand: startCommand.trim(), baseUrl, port: port || "2785", apiKey, browserExecutable };
  }

  private async resolveWorkingDirectory(configured: string) {
    if (configured) {
      const candidate = isAbsolute(configured) ? configured : resolve(this.projectRoot, configured);
      return (await this.isOpenWaDirectory(candidate)) ? candidate : null;
    }
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const candidates = [join(this.projectRoot, "OpenWA"), join(this.projectRoot, "openwa"), join(dirname(this.projectRoot), "OpenWA"), join(dirname(this.projectRoot), "openwa")];
    if (home) candidates.push(join(home, "OpenWA"), join(home, "openwa"));
    for (const candidate of candidates) {
      if (!(await this.isOpenWaDirectory(candidate))) continue;
      if (this.options.saveDetectedDirectory) await this.options.saveDetectedDirectory(candidate);
      else await saveRuntimeConfig("OPENWA_WORKING_DIRECTORY", candidate);
      return candidate;
    }
    return null;
  }

  private async isOpenWaDirectory(candidate: string) {
    try {
      const info = await stat(candidate);
      if (!info.isDirectory()) return false;
      const pkg = JSON.parse(await readFile(join(candidate, "package.json"), "utf8")) as { name?: string };
      return pkg.name?.toLowerCase() === "openwa";
    } catch { return false; }
  }

  private async resolveLaunch(cwd: string, configured: string): Promise<Launch | null> {
    let parts = parseCommand(configured);
    if (!parts.length) {
      const productionEntry = join(cwd, "dist", "main.js");
      // A built checkout is the safest default in both modes: the manager owns the
      // actual API process instead of an npm/watch wrapper that can orphan children.
      parts = await exists(productionEntry) ? [process.execPath, productionEntry] : ["npm", "run", "start:dev"];
    }
    if (["npm", "npm.cmd"].includes(parts[0].toLowerCase())) return npmLaunch(parts, cwd);
    if (["node", "node.exe"].includes(parts[0].toLowerCase())) return { executable: process.execPath, args: parts.slice(1), cwd };

    let executable = parts[0];
    if (!isAbsolute(executable) && /[\\/]/.test(executable)) executable = resolve(cwd, executable);
    if (/\.(c?js|mjs)$/i.test(executable)) return { executable: process.execPath, args: [executable, ...parts.slice(1)], cwd };
    if (/[\\/]/.test(executable) && !(await exists(executable))) throw new Error("Configured OpenWA startup executable does not exist");
    return { executable, args: parts.slice(1), cwd };
  }

  private async resolveBrowserExecutable(configured: string) {
    if (configured) return await exists(configured) ? configured : undefined;
    const candidates = process.platform === "win32"
      ? [
          process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
          process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
          process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
          process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
          process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
    for (const candidate of candidates) {
      if (!candidate || !(await exists(candidate))) continue;
      if (this.options.saveDetectedBrowser) await this.options.saveDetectedBrowser(candidate);
      else if (!this.options.loadConfig) await saveRuntimeConfig("OPENWA_BROWSER_EXECUTABLE", candidate);
      return candidate;
    }
    return undefined;
  }

  private async acquireLock(baseUrl: string, port: string): Promise<boolean> {
    await mkdir(dirname(this.lockPath), { recursive: true });
    try {
      const handle = await open(this.lockPath, "wx");
      await handle.writeFile(JSON.stringify({ managerPid: process.pid, createdAt: new Date().toISOString() }));
      await handle.close();
      this.ownsLock = true;
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const lock = JSON.parse(await readFile(this.lockPath, "utf8")) as { managerPid?: number };
        if (lock.managerPid) process.kill(lock.managerPid, 0);
        console.log("[OpenWA] Another Pigeon process is managing startup; waiting for readiness");
        await this.waitUntilReady(baseUrl, port, this.readyTimeoutMs);
        return false;
      } catch (lockError) {
        if ((lockError as NodeJS.ErrnoException).code !== "ESRCH") return false;
        await rm(this.lockPath, { force: true });
        return this.acquireLock(baseUrl, port);
      }
    }
  }

  private async spawnChild(launch: Launch, port: string, apiKey?: string, browserExecutable?: string) {
    this.stderrTail = "";
    const child = spawn(launch.executable, launch.args, {
      cwd: launch.cwd,
      env: { ...isolatedChildEnvironment(), PORT: port, RESOLVE_LID_TO_PHONE: "true", ...(apiKey ? { API_MASTER_KEY: apiKey } : {}), ...(browserExecutable ? { PUPPETEER_EXECUTABLE_PATH: browserExecutable } : {}) },
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    const spawned = new Promise<void>((resolvePromise, reject) => {
      child.once("spawn", resolvePromise);
      child.once("error", reject);
    });
    child.stderr?.on("data", chunk => { this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-4096); });
    child.once("exit", () => {
      if (this.child === child) this.child = null;
      if (!this.stopping && !this.starting) void this.handleUnexpectedExit();
    });
    if (this.ownsLock) await writeFile(this.lockPath, JSON.stringify({ managerPid: process.pid, openWaPid: child.pid, createdAt: new Date().toISOString() }));
    await spawned;
  }

  private async waitUntilReady(baseUrl: string, port: string, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.stopping) return false;
      if (await this.isHealthy(baseUrl, port, 2000)) return true;
      if (this.child && this.child.exitCode !== null) return false;
      await sleep(1000);
    }
    return false;
  }

  private async handleUnexpectedExit() {
    const now = Date.now();
    this.crashRestarts = this.crashRestarts.filter(timestamp => now - timestamp < 10 * 60_000);
    if (this.crashRestarts.length >= this.maxCrashRestarts) {
      this.lastError = "OpenWA stopped repeatedly; automatic restart limit reached";
      console.error("[OpenWA] Failed to restart: crash-loop limit reached");
      await this.releaseLock();
      return;
    }
    this.crashRestarts.push(now);
    console.log("[OpenWA] Restarting...");
    await sleep(Math.min(1000 * 2 ** this.crashRestarts.length, 10_000));
    const config = await this.loadConfig();
    const cwd = await this.resolveWorkingDirectory(config.workingDirectory);
    const launch = cwd ? await this.resolveLaunch(cwd, config.startCommand) : null;
    if (!launch || !config.autoStart) return;
    this.starting = true;
    let retry = false;
    try {
      const browserExecutable = await this.resolveBrowserExecutable(config.browserExecutable || "");
      await this.spawnChild(launch, config.port, config.apiKey, browserExecutable);
      if (await this.waitUntilReady(config.baseUrl, config.port, this.readyTimeoutMs)) console.log("[OpenWA] Ready");
      else throw new Error("OpenWA did not become healthy after restart");
    } catch {
      if (this.child) await this.terminateOwnedChild();
      retry = true;
    } finally {
      this.starting = false;
    }
    if (retry) await this.handleUnexpectedExit();
  }

  private async terminateOwnedChild() {
    const child = this.child;
    if (!child || child.exitCode !== null) { this.child = null; return; }
    child.kill("SIGTERM");
    await new Promise<void>(resolvePromise => {
      const forceTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolvePromise();
      }, this.stopTimeoutMs);
      child.once("exit", () => {
        clearTimeout(forceTimer);
        resolvePromise();
      });
    });
    if (this.child === child) this.child = null;
  }

  private async isHealthy(baseUrl: string, port: string, timeoutMs?: number) {
    if (this.options.healthCheck) return this.options.healthCheck({ baseUrl, port, timeoutMs });
    return (await checkOpenWaHealth({ baseUrl, port, timeoutMs })).available;
  }

  private async releaseLock() {
    if (!this.ownsLock) return;
    this.ownsLock = false;
    await rm(this.lockPath, { force: true });
  }
}

import { createServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OpenWaProcessManager, type OpenWaManagerConfig } from "@/server/openwa-process-manager";

const managers: OpenWaProcessManager[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map(manager => manager.stop()));
  await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => server.listen(0, "127.0.0.1", resolvePromise).once("error", reject));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate test port");
  await new Promise<void>(resolvePromise => server.close(() => resolvePromise()));
  return address.port;
}

async function fixture(mode: "healthy" | "crash" | "unhealthy" | "environment" = "healthy") {
  const directory = await mkdtemp(join(tmpdir(), "pigeon-openwa-manager-"));
  tempDirectories.push(directory);
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "openwa" }));
  const healthy = mode === "healthy" || mode === "environment";
  const source = mode !== "crash"
    ? `import{createServer}from'node:http';import{appendFileSync,writeFileSync}from'node:fs';appendFileSync(new URL('./starts.txt',import.meta.url),'start\\n');${mode === "environment" ? "writeFileSync(new URL('./observed-env.json',import.meta.url),JSON.stringify({master:process.env.API_MASTER_KEY,leak:process.env.PIGEON_SECRET_SENTINEL,browser:process.env.PUPPETEER_EXECUTABLE_PATH}));" : ""}const server=createServer((req,res)=>{if(req.url==='/api/health'){res.statusCode=${healthy ? 200 : 503};res.setHeader('content-type','application/json');res.end('{"status":"${healthy ? "ok" : "error"}"}')}else{res.statusCode=404;res.end()}});server.listen(Number(process.env.PORT),'127.0.0.1');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));`
    : `import{appendFileSync}from'node:fs';appendFileSync(new URL('./starts.txt',import.meta.url),'start\\n');process.exit(1);`;
  await writeFile(join(directory, "server.mjs"), source);
  return directory;
}

function config(directory: string, port: number, autoStart = true): OpenWaManagerConfig {
  return { autoStart, workingDirectory: directory, startCommand: "node server.mjs", baseUrl: `http://127.0.0.1:${port}/api`, port: String(port) };
}

async function eventually(check: () => boolean | Promise<boolean>, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error("Condition was not reached before timeout");
}

describe("OpenWaProcessManager", () => {
  it("starts, reuses and only stops the process it owns", async () => {
    const directory = await fixture();
    const port = await freePort();
    const first = new OpenWaProcessManager({ development: true, projectRoot: directory, loadConfig: async () => config(directory, port), readyTimeoutMs: 5000, stopTimeoutMs: 500 });
    const second = new OpenWaProcessManager({ development: true, projectRoot: directory, loadConfig: async () => config(directory, port), readyTimeoutMs: 5000, stopTimeoutMs: 500 });
    managers.push(first, second);

    expect(await first.start()).toBe(true);
    expect(first.pid).toBeTypeOf("number");
    const firstPid = first.pid;
    expect(await first.restart()).toBe(true);
    expect(first.pid).not.toBe(firstPid);
    expect(await second.start()).toBe(true);
    expect(second.pid).toBeNull();
    await second.stop();
    expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200);

    await first.stop();
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
    expect((await readFile(join(directory, "starts.txt"), "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("does not spawn when auto-start is disabled", async () => {
    const directory = await fixture();
    const port = await freePort();
    const manager = new OpenWaProcessManager({ development: true, projectRoot: directory, loadConfig: async () => config(directory, port, false) });
    managers.push(manager);
    expect(await manager.start()).toBe(false);
    expect(manager.pid).toBeNull();
  });

  it("restarts an owned process after an unexpected crash", async () => {
    const directory = await fixture();
    const port = await freePort();
    const manager = new OpenWaProcessManager({ development: true, projectRoot: directory, loadConfig: async () => config(directory, port), readyTimeoutMs: 5000, stopTimeoutMs: 500, maxCrashRestarts: 2 });
    managers.push(manager);
    expect(await manager.start()).toBe(true);
    const originalPid = manager.pid;
    if (!originalPid) throw new Error("OpenWA test process did not start");
    process.kill(originalPid);
    await eventually(() => manager.pid !== null && manager.pid !== originalPid);
    await eventually(async () => (await fetch(`http://127.0.0.1:${port}/api/health`).catch(() => null))?.status === 200);
    expect((await readFile(join(directory, "starts.txt"), "utf8")).trim().split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("bounds startup retries when the child crashes", async () => {
    const directory = await fixture("crash");
    const port = await freePort();
    const manager = new OpenWaProcessManager({ development: true, projectRoot: directory, loadConfig: async () => config(directory, port), readyTimeoutMs: 500, stopTimeoutMs: 500, maxStartAttempts: 2 });
    managers.push(manager);
    expect(await manager.start()).toBe(false);
    expect((await readFile(join(directory, "starts.txt"), "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("stops promptly while startup health checks are still pending", async () => {
    const directory = await fixture("unhealthy");
    const port = await freePort();
    const manager = new OpenWaProcessManager({ development: true, projectRoot: directory, loadConfig: async () => config(directory, port), readyTimeoutMs: 10_000, stopTimeoutMs: 500 });
    managers.push(manager);
    const starting = manager.start();
    await eventually(() => manager.pid !== null);
    await manager.stop();
    expect(await starting).toBe(false);
    expect(manager.pid).toBeNull();
  });

  it("passes only explicit OpenWA secrets and does not leak the Pigeon environment", async () => {
    const directory = await fixture("environment");
    const port = await freePort();
    const previous = process.env.PIGEON_SECRET_SENTINEL;
    process.env.PIGEON_SECRET_SENTINEL = "must-not-reach-openwa";
    const manager = new OpenWaProcessManager({
      development: true,
      projectRoot: directory,
      loadConfig: async () => ({ ...config(directory, port), apiKey: "explicit-openwa-key", browserExecutable: process.execPath }),
      readyTimeoutMs: 5000,
      stopTimeoutMs: 500,
    });
    managers.push(manager);
    try {
      expect(await manager.start()).toBe(true);
      const observed = JSON.parse(await readFile(join(directory, "observed-env.json"), "utf8")) as Record<string, string>;
      expect(observed).toEqual({ master: "explicit-openwa-key", browser: process.execPath });
    } finally {
      if (previous === undefined) delete process.env.PIGEON_SECRET_SENTINEL;
      else process.env.PIGEON_SECRET_SENTINEL = previous;
    }
  });
});

import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { prisma } from "./lib/prisma";
import { restoreOpenWaSessions } from "./lib/openwa-runtime";
import { startOpenWaEvents, stopOpenWaEvents } from "./lib/openwa-events";
import { ensureRuntimeConfigDefaults, runtimeConfig } from "./lib/runtime-config";
import { OpenWaProcessManager } from "./server/openwa-process-manager";
import { createSocketServer } from "./server/socket-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "localhost";
const port = Number(process.env.PORT ?? 3000);
const openWaManager = new OpenWaProcessManager({ development: dev });
const scheduledTimers: NodeJS.Timeout[] = [];
let shuttingDown = false;
let activeServer: ReturnType<typeof createServer> | null = null;
let openWaRecovery: Promise<boolean> | null = null;

function ensureOpenWaRunning() {
  if (shuttingDown) return Promise.resolve(false);
  if (openWaRecovery) return openWaRecovery;
  openWaRecovery = openWaManager.start()
    .then(ready => {
      if (ready) void startOpenWaEvents();
      return ready;
    })
    .catch(error => {
      console.error("[OpenWA] Recovery failed", error instanceof Error ? error.message : error);
      return false;
    })
    .finally(() => { openWaRecovery = null; });
  return openWaRecovery;
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Pigeon received ${signal}; shutting down`);
  for (const timer of scheduledTimers) clearInterval(timer);
  stopOpenWaEvents();
  if (activeServer?.listening) await new Promise<void>(resolvePromise => activeServer?.close(() => resolvePromise()));
  await openWaManager.stop();
  await prisma.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown(signal).finally(() => process.exit(0)));
}

async function main() {
  await ensureRuntimeConfigDefaults();
  const openWaReady = await openWaManager.start().catch(error => {
    console.error("[OpenWA] Failed to start", error instanceof Error ? error.message : "unknown startup error");
    return false;
  });

  let handler: ReturnType<ReturnType<typeof next>["getRequestHandler"]> | undefined;
  const server = createServer((request, response) => {
    if (handler) return handler(request, response);
    response.statusCode = 503;
    response.end("Pigeon is starting...");
  });
  activeServer = server;

  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(port, hostname, () => {
        server.off("error", reject);
        resolvePromise();
      });
    });
    const app = next({ dev, hostname, port });
    await app.prepare();
    handler = app.getRequestHandler();
    createSocketServer(server);
    console.log(`Pigeon ready on http://${hostname}:${port}`);
    await scheduleJobs();
    if (openWaReady) {
      void restoreOpenWaSessions();
      void startOpenWaEvents();
    }

  } catch (error) {
    server.close();
    await openWaManager.stop();
    throw error;
  }
}

void main().catch(error => {
  console.error("Failed to start Pigeon", error);
  process.exitCode = 1;
});

let lastArchiveDate = "";
async function scheduleJobs() {
  const secret = await runtimeConfig("CRON_SECRET");
  if (!secret) return;
  const call = (path: string) => fetch(`http://${hostname}:${port}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  }).catch(error => console.error(`Cron ${path} failed`, error));
  scheduledTimers.push(
    setInterval(() => void ensureOpenWaRunning(), 30_000),
    setInterval(() => void call("/api/cron/publish-posts"), 60_000),
    setInterval(() => void call("/api/cron/send-broadcasts"), 60_000),
    setInterval(() => void call("/api/cron/fb-sync"), 15 * 60_000),
    setInterval(() => void call("/api/cron/wa-heartbeat"), 30_000),
    setInterval(() => void call("/api/cron/notifications-cleanup"), 24 * 60 * 60_000),
    setInterval(() => void checkArchiveTime(call).catch(error => console.error("Archive schedule check failed", error)), 60_000),
  );
}

async function checkArchiveTime(call: (path: string) => Promise<unknown>) {
  const setting = await prisma.setting.findUnique({ where: { key: "archive_time" } });
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (current === (setting?.value ?? "00:00") && lastArchiveDate !== day) {
    await call("/api/cron/archive-messages");
    lastArchiveDate = day;
  }
}

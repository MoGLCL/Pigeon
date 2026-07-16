import { io, type Socket } from "socket.io-client";
import { prisma } from "@/lib/prisma";
import { ingestOpenWaEvent, queueOpenWaSync } from "@/lib/openwa-runtime";
import { runtimeConfig } from "@/lib/runtime-config";

type OpenWaEventEnvelope = {
  type: "event" | "subscribed" | "error" | string;
  payload?: { event?: string; sessionId?: string; data?: unknown };
  message?: string;
};

let socket: Socket | null = null;

function socketOrigin(apiBase: string) {
  const url = new URL(apiBase);
  return `${url.protocol}//${url.host}/events`;
}

async function syncSession(providerSessionId?: string) {
  if (!providerSessionId) return;
  const account = await prisma.whatsAppAccount.findUnique({
    where: { providerSessionId },
    select: { id: true },
  });
  if (!account) return;
  await queueOpenWaSync(account.id);
}

function reconcileSession(providerSessionId: string) {
  const timer = setTimeout(() => {
    void syncSession(providerSessionId).catch((error) =>
      console.error(
        "[OpenWA events] Background reconciliation failed",
        error instanceof Error ? error.message : error,
      ),
    );
  }, 750);
  timer.unref?.();
}

export async function startOpenWaEvents() {
  if (socket) return socket;
  const [baseUrl, apiKey] = await Promise.all([
    runtimeConfig("OPENWA_BASE_URL"),
    runtimeConfig("OPENWA_API_KEY"),
  ]);
  if (!baseUrl || !apiKey) return null;

  socket = io(socketOrigin(baseUrl), {
    auth: { apiKey },
    transports: ["websocket"],
    reconnection: true,
  });
  socket.on("connect", () => {
    socket?.emit("message", {
      type: "subscribe",
      sessionId: "*",
      events: [
        "message.received",
        "message.sent",
        "message.ack",
        "session.status",
      ],
      requestId: "pigeon-live-sync",
    });
  });
  socket.on("message", (message: OpenWaEventEnvelope) => {
    if (message.type !== "event" || !message.payload?.sessionId) return;
    const event = message.payload.event ?? "";
    if (event.startsWith("message.")) {
      void ingestOpenWaEvent(
        message.payload.sessionId,
        event,
        message.payload.data,
      )
        .then((handled) => {
          if (handled && event !== "message.ack")
            reconcileSession(message.payload!.sessionId!);
        })
        .catch((error) => {
          console.error(
            "[OpenWA events] Live ingest failed",
            error instanceof Error ? error.message : error,
          );
          reconcileSession(message.payload!.sessionId!);
        });
    }
  });
  socket.on("connect_error", (error) =>
    console.error("[OpenWA events] Connection failed", error.message),
  );
  return socket;
}

export function stopOpenWaEvents() {
  socket?.disconnect();
  socket = null;
}

import { prisma } from "@/lib/prisma";
import { ensureOpenWaSession, getOpenWaStatus, logoutOpenWaSession, stopOpenWaSession, waitForOpenWaQr } from "@/lib/openwa-runtime";
import { qrImageSource } from "@/lib/openwa";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { z } from "zod";

const schema = z.object({ accountId: z.string().uuid(), action: z.enum(["qr", "status", "start", "stop", "logout"]) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Invalid session action", 422);
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: parsed.data.accountId, ownerId: guard.user.id } });
  if (!account) return jsonError("Account not found", 404);
  try {
    if (parsed.data.action === "qr") {
      const qr = await waitForOpenWaQr(account.id, 5000);
      const current = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: account.id }, select: { status: true } });
      return Response.json({ qrCode: qr ? qrImageSource(qr) : null, status: current.status, pending: !qr && current.status !== "connected" });
    }
    if (parsed.data.action === "status") return Response.json(await getOpenWaStatus(account.id));
    if (parsed.data.action === "start") return Response.json(await ensureOpenWaSession(account.id));
    if (parsed.data.action === "stop") return Response.json(await stopOpenWaSession(account.id));
    return Response.json(await logoutOpenWaSession(account.id));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "OpenWA is unavailable", 502);
  }
}

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { deleteOpenWaSession, waitForOpenWaQr } from "@/lib/openwa-runtime";
import { qrImageSource } from "@/lib/openwa";

const createSchema = z.object({ connectionName: z.string().trim().min(1).max(80) });
const deleteSchema = z.object({ accountId: z.string().uuid(), confirmation: z.literal("DELETE") });
const accountSelect = { id: true, sessionName: true, phoneNumber: true, displayName: true, avatarUrl: true, status: true, lastHeartbeat: true, lastConnectedAt: true, lastError: true, createdAt: true } as const;

export async function GET() {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  return Response.json(await prisma.whatsAppAccount.findMany({ where: { ownerId: guard.user.id }, select: accountSelect, orderBy: { createdAt: "desc" } }));
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const parsed = createSchema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Enter a connection name", 422, parsed.error.flatten());
  const id = randomUUID();
  await prisma.whatsAppAccount.create({ data: { id, ownerId: guard.user.id, sessionName: parsed.data.connectionName, status: "preparing" } });
  await writeAuditLog(guard.user.id, "openwa.account.connect", { id, connectionName: parsed.data.connectionName }, guard.user.id);
  try {
    const qr = await waitForOpenWaQr(id, 7000);
    const account = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id }, select: accountSelect });
    return Response.json({ account, qrCode: qr ? qrImageSource(qr) : null, pending: !qr && account.status !== "connected" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenWA connection could not be prepared";
    await prisma.whatsAppAccount.update({ where: { id }, data: { status: "error", lastError: message.slice(0, 500) } });
    return jsonError(message, 502);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const parsed = deleteSchema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Invalid WhatsApp account", 422);
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: parsed.data.accountId, ownerId: guard.user.id }, select: { id: true, sessionName: true } });
  if (!account) return jsonError("Account not found", 404);
  const conversations = await prisma.whatsAppConversation.findMany({ where: { accountId: account.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.whatsAppMessage.deleteMany({ where: { conversationId: { in: conversations.map(item => item.id) } } }),
    prisma.whatsAppConversation.deleteMany({ where: { accountId: account.id } }),
    prisma.automationRule.deleteMany({ where: { waAccountId: account.id } }),
    prisma.whatsAppAccount.delete({ where: { id: account.id } }),
  ]);
  await writeAuditLog(guard.user.id, "openwa.account.delete", { id: account.id, connectionName: account.sessionName }, guard.user.id);
  void deleteOpenWaSession(account.id).catch((error) => console.error("OpenWA session cleanup failed", account.id, error));
  return Response.json({ ok: true, providerCleanup: "queued" });
}

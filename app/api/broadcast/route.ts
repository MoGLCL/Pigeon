import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  channel: z.enum(["whatsapp", "messenger"]),
  senderId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  message: z.string().trim().min(1).max(4000),
  scheduledAt: z.coerce.date().optional(),
  recipientIds: z.array(z.string().uuid()).min(1).max(5000),
});

export async function GET() {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const userId = guard.user.id;
  const [campaigns, whatsappAccounts, facebookPages, whatsappContacts, messengerContacts] = await Promise.all([
    prisma.broadcast.findMany({ where: { userId }, include: { _count: { select: { recipients: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.whatsAppAccount.findMany({ where: { ownerId: userId, status: "connected" }, select: { id: true, sessionName: true, displayName: true, phoneNumber: true } }),
    prisma.facebookPage.findMany({ where: { ownerId: userId, status: "connected" }, select: { id: true, name: true, avatarUrl: true } }),
    prisma.contact.findMany({ where: { userId, phone: { startsWith: "+" } }, select: { id: true, name: true, phone: true, avatarUrl: true }, orderBy: { lastMessageAt: "desc" }, take: 1000 }),
    prisma.facebookConversation.findMany({ where: { page: { ownerId: userId }, participantId: { not: null } }, select: { id: true, participantId: true, participantName: true, participantAvatarUrl: true, pageId: true, page: { select: { name: true } } }, orderBy: { lastMessageAt: "desc" }, take: 1000 }),
  ]);
  return Response.json({ campaigns, senders: { whatsapp: whatsappAccounts, messenger: facebookPages }, recipients: { whatsapp: whatsappContacts, messenger: messengerContacts } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  if (!rateLimit(`broadcast:${clientIp(request)}`, 5, 60000).allowed) return jsonError("Broadcast rate limit exceeded", 429);
  const parsed = schema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Invalid broadcast", 422, parsed.error.flatten());
  const input = parsed.data, userId = guard.user.id;
  if (input.channel === "whatsapp") {
    const sender = await prisma.whatsAppAccount.findFirst({ where: { id: input.senderId, ownerId: userId, status: "connected" }, select: { id: true } });
    if (!sender) return jsonError("WhatsApp sender is not connected", 404);
  } else {
    const sender = await prisma.facebookPage.findFirst({ where: { id: input.senderId, ownerId: userId, status: "connected" }, select: { id: true } });
    if (!sender) return jsonError("Messenger Page is not connected", 404);
  }
  const recipients = input.channel === "whatsapp"
    ? (await prisma.contact.findMany({ where: { userId, id: { in: input.recipientIds } }, select: { id: true, phone: true } })).map((item) => ({ contactId: item.id, phone: item.phone }))
    : (await prisma.facebookConversation.findMany({ where: { id: { in: input.recipientIds }, pageId: input.senderId, page: { ownerId: userId }, participantId: { not: null } }, select: { participantId: true } })).map((item) => ({ phone: item.participantId! }));
  if (!recipients.length) return jsonError("Select recipients that belong to the chosen sender", 422);
  const item = await prisma.broadcast.create({ data: {
    userId, channel: input.channel, name: input.name, message: input.message,
    attachments: { senderId: input.senderId }, scheduledAt: input.scheduledAt,
    status: input.scheduledAt ? "scheduled" : "queued", totalCount: recipients.length,
    recipients: { create: recipients },
  } });
  await writeAuditLog(userId, "broadcast.create", { id: item.id, total: item.totalCount, channel: item.channel, senderId: input.senderId });
  return Response.json(item, { status: 201 });
}

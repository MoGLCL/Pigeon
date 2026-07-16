import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { jsonError, requireUser, sameOrigin } from "@/lib/api";
import { queueOpenWaSync } from "@/lib/openwa-runtime";

const mediaHydrationAt = new Map<string, number>();

export async function GET(request: Request) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id, account: { ownerId: guard.user.id } },
      include: {
        account: { select: { id: true, sessionName: true, phoneNumber: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1000 },
      },
    });
    if (
      conversation?.messages.slice(0, 50).some(
        (message) => message.type === "image" && !message.mediaUrl,
      ) &&
      Date.now() - (mediaHydrationAt.get(conversation.account.id) || 0) > 60_000
    ) {
      mediaHydrationAt.set(conversation.account.id, Date.now());
      await queueOpenWaSync(conversation.account.id).catch(() => 0);
      conversation.messages = await prisma.whatsAppMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { sentAt: "desc" },
        take: 1000,
      });
    }
    if (conversation?.unreadCount)
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { unreadCount: 0 },
      });
    return Response.json(
      conversation
        ? {
            ...conversation,
            messages: conversation.messages.reverse().map(
              ({ contentEnc, ...message }) => ({
                ...message,
                content: contentEnc ? decrypt(contentEnc) : null,
              }),
            ),
          }
        : null,
    );
  }
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { ownerId: guard.user.id, status: "connected" },
    select: { id: true },
  });
  for (const account of accounts)
    void queueOpenWaSync(account.id).catch(() => 0);
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { account: { ownerId: guard.user.id }, hiddenAt: null },
    include: {
      account: { select: { id: true, sessionName: true, phoneNumber: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  return Response.json(
    conversations.map((item) => ({
      ...item,
      messages: item.messages.map(({ contentEnc, ...message }) => ({
        ...message,
        content: contentEnc ? decrypt(contentEnc) : null,
      })),
    })),
  );
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const body = await request.json().catch(() => null);
  if (body?.confirm !== true) return jsonError("Confirmation is required", 422);
  const result = await prisma.whatsAppConversation.updateMany({
    where: { account: { ownerId: guard.user.id } },
    data: { hiddenAt: new Date(), unreadCount: 0 },
  });
  return Response.json({ cleared: result.count });
}

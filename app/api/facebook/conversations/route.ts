import { prisma } from "@/lib/prisma";
import { decryptFacebookMessage } from "@/lib/facebook";
import { jsonError, requireUser, sameOrigin } from "@/lib/api";

export async function GET(request: Request) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const conversation = await prisma.facebookConversation.findFirst({
      where: { id, page: { ownerId: guard.user.id } },
      include: {
        page: { select: { id: true, name: true, avatarUrl: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1000 },
      },
    });
    if (conversation?.unreadCount)
      await prisma.facebookConversation.update({
        where: { id: conversation.id },
        data: { unreadCount: 0 },
      });
    return Response.json(
      conversation
        ? {
            ...conversation,
            unreadCount: 0,
            messages: conversation.messages.reverse().map(decryptFacebookMessage),
          }
        : null,
    );
  }
  const items = await prisma.facebookConversation.findMany({
    where: { page: { ownerId: guard.user.id }, hiddenAt: null },
    include: {
      page: { select: { id: true, name: true, avatarUrl: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  return Response.json(
    items.map((item) => ({
      ...item,
      messages: item.messages.map(decryptFacebookMessage),
    })),
  );
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const body = await request.json().catch(() => null);
  if (body?.confirm !== true) return jsonError("Confirmation is required", 422);
  const result = await prisma.facebookConversation.updateMany({
    where: { page: { ownerId: guard.user.id } },
    data: { hiddenAt: new Date(), unreadCount: 0 },
  });
  return Response.json({ cleared: result.count });
}

import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/api";
import { decrypt } from "@/lib/encryption";

const DAY = 86400000,
  MAX_DAYS = 90;
export async function GET(request: Request) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const userId = guard.user.id,
    now = new Date();
  const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true },
    }),
    url = new URL(request.url);
  let end = parseDate(url.searchParams.get("end")) ?? now;
  if (end > now) end = now;
  end.setHours(23, 59, 59, 999);
  let start =
    parseDate(url.searchParams.get("start")) ??
    new Date(end.getTime() - 6 * DAY);
  start.setHours(0, 0, 0, 0);
  const earliest = new Date(
    Math.max(user.createdAt.getTime(), end.getTime() - (MAX_DAYS - 1) * DAY),
  );
  earliest.setHours(0, 0, 0, 0);
  if (start < earliest) start = earliest;
  if (start > end) return jsonError("Start date must be before end date", 422);
  const [
    fb,
    wa,
    contacts,
    pages,
    accounts,
    recentFb,
    recentWa,
    broadcasts,
    posts,
    activeAutomations,
    openTickets,
    unreadWhatsApp,
    unreadMessenger,
  ] = await Promise.all([
    prisma.facebookMessage.findMany({
      where: {
        sentAt: { gte: start, lte: end },
        conversation: { page: { ownerId: userId } },
      },
      select: { sentAt: true, fromPage: true },
    }),
    prisma.whatsAppMessage.findMany({
      where: {
        sentAt: { gte: start, lte: end },
        conversation: { account: { ownerId: userId } },
      },
      select: { sentAt: true, fromMe: true, status: true },
    }),
    prisma.contact.count({
      where: { userId, createdAt: { gte: start, lte: end } },
    }),
    prisma.facebookPage.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        webhookVerified: true,
        followersCount: true,
      },
    }),
    prisma.whatsAppAccount.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        sessionName: true,
        displayName: true,
        phoneNumber: true,
        status: true,
        lastHeartbeat: true,
      },
    }),
    prisma.facebookConversation.findMany({
      where: { page: { ownerId: userId }, hiddenAt: null },
      include: {
        page: { select: { name: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
    }),
    prisma.whatsAppConversation.findMany({
      where: { account: { ownerId: userId }, hiddenAt: null },
      include: {
        account: { select: { sessionName: true, displayName: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
    }),
    prisma.broadcast.findMany({
      where: { userId, status: "scheduled", scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.facebookPost.findMany({
      where: {
        page: { ownerId: userId },
        status: "scheduled",
        scheduledAt: { gte: now },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.automationRule.count({ where: { userId, isActive: true } }),
    prisma.report.count({
      where: { userId, status: { in: ["open", "in_review"] } },
    }),
    prisma.whatsAppConversation.aggregate({
      where: { account: { ownerId: userId } },
      _sum: { unreadCount: true },
    }),
    prisma.facebookConversation.aggregate({
      where: { page: { ownerId: userId } },
      _sum: { unreadCount: true },
    }),
  ]);
  const totalDays = Math.max(
      1,
      Math.floor((end.getTime() - start.getTime()) / DAY) + 1,
    ),
    bucketSize = Math.max(1, Math.ceil(totalDays / 15)),
    bucketCount = Math.ceil(totalDays / bucketSize);
  const labels = Array.from({ length: bucketCount }, (_, index) =>
    new Date(start.getTime() + index * bucketSize * DAY)
      .toISOString()
      .slice(0, 10),
  );
  const countBuckets = (items: { sentAt: Date }[]) =>
    labels.map((_, index) => {
      const from = start.getTime() + index * bucketSize * DAY,
        to = Math.min(end.getTime(), from + bucketSize * DAY - 1);
      return items.filter((item) => {
        const time = item.sentAt.getTime();
        return time >= from && time <= to;
      }).length;
    });
  const conversations = [
    ...recentFb.map((item) => ({
      id: item.id,
      name: item.participantName ?? "Facebook contact",
      message: item.messages[0]
        ? decrypt(item.messages[0].contentEnc)
        : "No messages yet",
      accountName: item.page.name,
      time: item.lastMessageAt,
      channel: "facebook",
      unread: item.unreadCount,
      avatarUrl: item.participantAvatarUrl,
    })),
    ...recentWa.map((item) => ({
      id: item.id,
      name: item.contactName ?? item.contactPhone,
      message: item.messages[0]?.contentEnc
        ? decrypt(item.messages[0].contentEnc)
        : (item.messages[0]?.type ?? "No messages yet"),
      accountName: item.account.displayName || item.account.sessionName,
      time: item.lastMessageAt,
      channel: "whatsapp",
      unread: item.unreadCount,
      avatarUrl: item.contactAvatarUrl,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime(),
    )
    .slice(0, 5);
  const scheduled = [
    ...broadcasts.map((item) => ({
      id: item.id,
      title: item.name,
      type: `${item.channel} broadcast`,
      date: item.scheduledAt,
      channel: item.channel,
    })),
    ...posts.map((item) => ({
      id: item.id,
      title: item.content.slice(0, 70),
      type: "Facebook post",
      date: item.scheduledAt,
      channel: "facebook",
    })),
  ]
    .sort(
      (a, b) =>
        new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime(),
    )
    .slice(0, 5);
  const [publishedPosts, facebookComments, topWhatsApp, topMessenger] = await Promise.all([
    prisma.facebookPost.findMany({
      where: { page: { ownerId: userId }, publishedAt: { gte: start, lte: end } },
      select: { id: true, content: true, reactions: true, commentsCount: true, shares: true, page: { select: { name: true } } },
      take: 100,
    }),
    prisma.facebookComment.count({ where: { page: { ownerId: userId }, postedAt: { gte: start, lte: end } } }),
    prisma.whatsAppConversation.findMany({
      where: { account: { ownerId: userId }, lastMessageAt: { gte: start, lte: end } },
      select: { id: true, contactName: true, contactPhone: true, contactAvatarUrl: true, _count: { select: { messages: true } } },
      orderBy: { messages: { _count: "desc" } }, take: 5,
    }),
    prisma.facebookConversation.findMany({
      where: { page: { ownerId: userId }, lastMessageAt: { gte: start, lte: end } },
      select: { id: true, participantName: true, participantAvatarUrl: true, _count: { select: { messages: true } } },
      orderBy: { messages: { _count: "desc" } }, take: 5,
    }),
  ]);
  const channelCounts = { whatsapp: wa.length, messenger: fb.length, facebook: publishedPosts.length + facebookComments };
  const channelTotal = Object.values(channelCounts).reduce((sum, count) => sum + count, 0);
  const percent = (count: number) => channelTotal ? Math.round((count / channelTotal) * 100) : 0;
  const topContacts = [
    ...topWhatsApp.map((item) => ({ id: item.id, name: item.contactName || item.contactPhone, avatarUrl: item.contactAvatarUrl, channel: "whatsapp", messages: item._count.messages })),
    ...topMessenger.map((item) => ({ id: item.id, name: item.participantName || "Messenger contact", avatarUrl: item.participantAvatarUrl, channel: "messenger", messages: item._count.messages })),
  ].sort((a, b) => b.messages - a.messages).slice(0, 5);
  const sourcePosts = publishedPosts.map((item) => ({
    id: item.id, title: item.content.slice(0, 80) || "Media post", page: item.page.name,
    engagement: item.reactions + item.commentsCount + item.shares,
    comments: item.commentsCount,
  })).sort((a, b) => b.engagement - a.engagement).slice(0, 5);
  return Response.json({
    user: {
      name: guard.user.name,
      username: guard.user.username,
      role: guard.user.role,
      createdAt: user.createdAt,
    },
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      maxDays: MAX_DAYS,
      bucketDays: bucketSize,
    },
    stats: {
      total: fb.length + wa.length,
      delivered:
        fb.filter((item) => item.fromPage).length +
        wa.filter((item) => ["delivered", "read"].includes(item.status)).length,
      replies:
        fb.filter((item) => item.fromPage).length +
        wa.filter((item) => item.fromMe).length,
      contacts,
    },
    activity: {
      labels,
      facebook: countBuckets(fb),
      whatsapp: countBuckets(wa),
    },
    analytics: {
      channels: [
        { key: "whatsapp", label: "WhatsApp messages", count: channelCounts.whatsapp, percent: percent(channelCounts.whatsapp) },
        { key: "messenger", label: "Messenger messages", count: channelCounts.messenger, percent: percent(channelCounts.messenger) },
        { key: "facebook", label: "Facebook posts & comments", count: channelCounts.facebook, percent: percent(channelCounts.facebook) },
      ],
      topContacts,
      sourcePosts,
      totalActivity: channelTotal,
    },
    channels: [
      ...pages.map((item) => ({
        id: item.id,
        name: item.name,
        handle: "Facebook Page",
        status: item.webhookVerified ? "Connected" : "Setup required",
        tone: "facebook",
      })),
      ...accounts.map((item) => ({
        id: item.id,
        name: item.displayName || item.sessionName,
        handle: item.phoneNumber ?? "WhatsApp connection",
        status: item.status,
        tone: "whatsapp",
      })),
    ],
    conversations,
    scheduled,
    insights: {
      unread:
        (unreadWhatsApp._sum.unreadCount ?? 0) +
        (unreadMessenger._sum.unreadCount ?? 0),
      activeAutomations,
      openTickets,
      scheduled: scheduled.length,
    },
  });
}
function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

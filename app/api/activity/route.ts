import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { decrypt } from "@/lib/encryption";
import { activityVerificationExpiresAt } from "@/lib/activity-verification";

function device(userAgent?: string | null) {
  const ua = userAgent ?? "";
  const type = /mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Desktop";
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /chrome/i.test(ua)
      ? "Chrome"
      : /firefox/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : "Unknown browser";
  const os = /windows/i.test(ua)
    ? "Windows"
    : /android/i.test(ua)
      ? "Android"
      : /iphone|ipad|ios/i.test(ua)
        ? "iOS"
        : /mac os/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  return { type, browser, os };
}

export async function GET(request: Request) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const now = new Date();
  const [sessions, audit, notifications] = await Promise.all([
    prisma.userSession.findMany({
      where: { userId: guard.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.auditLog.findMany({
      where: { actorId: guard.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.findMany({
      where: { userId: guard.user.id },
      orderBy: { createdAt: "desc" },
      skip: 20,
      take: 100,
    }),
  ]);
  return Response.json({
    verificationExpiresAt: activityVerificationExpiresAt(
      request,
      guard.user.id,
      guard.user.sessionToken,
    ),
    activeSessions: sessions.filter((item) => item.expiresAt > now).length,
    logins: sessions.map((item) => ({
      id: item.id,
      ipAddress: item.ipAddress || "Unknown",
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      active: item.expiresAt > now,
      current: item.token === guard.user.sessionToken,
      ...device(item.userAgent),
    })),
    activity: audit.map((item) => {
      let details: unknown = null;
      try {
        details = JSON.parse(decrypt(item.detailsEnc));
      } catch {}
      return {
        id: item.id,
        action: item.action,
        ipAddress: item.ipAddress,
        createdAt: item.createdAt,
        details,
      };
    }),
    olderNotifications: notifications,
  });
}

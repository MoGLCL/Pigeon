import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, sameOrigin } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  ACTIVITY_VERIFICATION_TTL_SECONDS,
  activityVerificationCookie,
  activityVerificationExpiresAt,
  createActivityVerification,
} from "@/lib/activity-verification";

const confirmation = z.object({ password: z.string().min(8).max(128).optional() });

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const parsed = confirmation.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError("Enter your account password", 422);

  const verifiedUntil = activityVerificationExpiresAt(
    request,
    guard.user.id,
    guard.user.sessionToken,
  );
  let freshVerification: ReturnType<typeof createActivityVerification> | null = null;
  if (!verifiedUntil) {
    if (!parsed.data.password) return jsonError("Enter your account password", 422);
    if (!rateLimit(`session-disconnect:${guard.user.id}:${clientIp(request)}`, 8, 60_000).allowed)
      return jsonError("Too many password attempts. Try again in one minute", 429);
    const user = await prisma.user.findUnique({
      where: { id: guard.user.id },
      select: { passwordHash: true },
    });
    if (!user || !await compare(parsed.data.password, user.passwordHash))
      return jsonError("Incorrect password", 401);
    freshVerification = createActivityVerification(guard.user.id, guard.user.sessionToken);
  }

  const { id } = await params;
  const session = await prisma.userSession.findFirst({ where: { id, userId: guard.user.id } });
  if (!session) return jsonError("Session not found", 404);
  if (session.token === guard.user.sessionToken) return jsonError("Use Log out to end your current session", 409);

  await prisma.userSession.delete({ where: { id: session.id } });
  await writeAuditLog(guard.user.id, "session.disconnect", { sessionId: session.id }, guard.user.id);
  return Response.json(
    { ok: true, verificationExpiresAt: freshVerification?.expiresAt || verifiedUntil },
    freshVerification
      ? {
          headers: {
            "set-cookie": activityVerificationCookie(
              freshVerification.value,
              request,
              ACTIVITY_VERIFICATION_TTL_SECONDS,
            ),
          },
        }
      : undefined,
  );
}

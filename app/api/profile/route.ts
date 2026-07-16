import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/),
  email: z.string().email().transform(value => value.toLowerCase()),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/),
});

export async function GET() {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  return Response.json(await prisma.user.findUnique({ where: { id: guard.user.id }, select: { id: true, name: true, username: true, email: true, avatarUrl: true, role: true } }));
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const data = await parseJson(request);
  if (data?.action === "password") {
    const parsed = passwordSchema.safeParse(data);
    if (!parsed.success) return jsonError("Invalid password data", 422, parsed.error.flatten());
    const current = await prisma.user.findUniqueOrThrow({ where: { id: guard.user.id }, select: { passwordHash: true } });
    if (!(await compare(parsed.data.currentPassword, current.passwordHash))) return jsonError("Current password is incorrect", 403);
    await prisma.$transaction([
      prisma.user.update({ where: { id: guard.user.id }, data: { passwordHash: await hash(parsed.data.newPassword, 12), forcePasswordReset: false } }),
      prisma.userSession.deleteMany({ where: { userId: guard.user.id, token: { not: guard.user.sessionToken } } }),
    ]);
    await writeAuditLog(guard.user.id, "profile.password.change", { sessionsRevoked: true }, guard.user.id);
    return Response.json({ ok: true });
  }
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return jsonError("Invalid profile data", 422, parsed.error.flatten());
  const duplicate = await prisma.user.findFirst({ where: { id: { not: guard.user.id }, OR: [{ email: parsed.data.email }, { username: parsed.data.username }] }, select: { id: true } });
  if (duplicate) return jsonError("Email or username is already in use", 409);
  const user = await prisma.user.update({ where: { id: guard.user.id }, data: parsed.data, select: { id: true, name: true, username: true, email: true, avatarUrl: true, role: true } });
  await writeAuditLog(guard.user.id, "profile.update", { fields: ["name", "username", "email"] }, guard.user.id);
  return Response.json(user);
}

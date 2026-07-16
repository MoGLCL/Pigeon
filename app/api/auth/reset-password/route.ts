import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, parseJson, sameOrigin } from "@/lib/api";
import { passwordResetSchema } from "@/lib/validators/auth.schema";
export async function POST(request: Request) { if (!sameOrigin(request)) return jsonError("Invalid origin", 403); const guard = await requireUser(); if ("error" in guard) return guard.error; const parsed = passwordResetSchema.safeParse(await parseJson(request)); if (!parsed.success) return jsonError("Invalid password", 422, parsed.error.flatten()); await prisma.$transaction([prisma.user.update({ where: { id: guard.user.id }, data: { passwordHash: await hash(parsed.data.password, 12), forcePasswordReset: false } }), prisma.userSession.deleteMany({ where: { userId: guard.user.id, token: { not: guard.user.sessionToken } } })]); return Response.json({ ok: true }); }

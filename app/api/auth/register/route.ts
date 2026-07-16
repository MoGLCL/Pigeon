import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registrationSchema } from "@/lib/validators/auth.schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { jsonError, parseJson, sameOrigin } from "@/lib/api";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const registration=await prisma.setting.findUnique({where:{key:"registration_open"}});if(registration?.value==="false")return jsonError("Registration is currently closed",403);
  if (!rateLimit(`register:${clientIp(request)}`, 3, 3600000).allowed) return jsonError("Too many registrations", 429);
  const parsed = registrationSchema.safeParse(await parseJson(request)); if (!parsed.success) return jsonError("Invalid registration data", 422, parsed.error.flatten());
  if (await prisma.user.findFirst({ where: { OR: [{ email: parsed.data.email }, { username: parsed.data.username }] }, select: { id: true } })) return jsonError("Email or username already registered", 409);
  const user = await prisma.user.create({ data: { name: parsed.data.name, username: parsed.data.username, email: parsed.data.email, passwordHash: await hash(parsed.data.password, 12), role: "user" }, select: { id: true, name: true, username: true, email: true, role: true } });
  return Response.json({ user }, { status: 201 });
}

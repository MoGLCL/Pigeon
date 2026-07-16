import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIp,rateLimit } from "@/lib/rate-limit";
import { jsonError,parseJson,sameOrigin } from "@/lib/api";
const schema=z.object({identifier:z.string().trim().min(3).max(254),password:z.string().min(8).max(128)});
export async function POST(request:Request){if(!sameOrigin(request))return jsonError("Invalid origin",403);if(!rateLimit(`login-status:${clientIp(request)}`,10,60_000).allowed)return jsonError("Too many sign-in attempts",429);const parsed=schema.safeParse(await parseJson(request));if(!parsed.success)return jsonError("Invalid credentials",401);const identifier=parsed.data.identifier.toLowerCase();const user=await prisma.user.findFirst({where:{OR:[{email:identifier},{username:identifier}]},select:{passwordHash:true,status:true}});if(!user||!await compare(parsed.data.password,user.passwordHash))return jsonError("Invalid credentials",401);return Response.json({status:user.status,supportUrl:"/support"})}

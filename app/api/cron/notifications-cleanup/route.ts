import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { validCronRequest } from "@/lib/cron-auth";
export async function POST(request: Request) { if (!await validCronRequest(request)) return jsonError("Unauthorized", 401); const before = new Date(Date.now() - 30 * 86400000); return Response.json(await prisma.notification.deleteMany({ where: { isRead: true, createdAt: { lt: before } } })); }

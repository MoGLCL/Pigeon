import { prisma } from "@/lib/prisma";
import { getOpenWaStatus, queueOpenWaSync } from "@/lib/openwa-runtime";
import { jsonError } from "@/lib/api";
import { validCronRequest } from "@/lib/cron-auth";
export async function POST(request: Request) {
  if (!await validCronRequest(request)) return jsonError("Unauthorized", 401);
  const accounts = await prisma.whatsAppAccount.findMany({ where: { status: { not: "logged_out" } } }); let synced = 0;
  for (const account of accounts) try { const current = await getOpenWaStatus(account.id); if (current.status === "connected") synced += await queueOpenWaSync(account.id); } catch (error) { await prisma.whatsAppAccount.update({ where: { id: account.id }, data: { status: "error", lastError: error instanceof Error ? error.message.slice(0, 500) : "OpenWA heartbeat failed" } }); }
  return Response.json({ checked: accounts.length, synced });
}

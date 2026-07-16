import { prisma } from "./prisma";
import { encrypt } from "./encryption";

export async function writeAuditLog(actorId: string, action: string, details: unknown, targetId?: string, ipAddress?: string) {
  return prisma.auditLog.create({ data: { actorId, action, targetId, ipAddress, detailsEnc: encrypt(JSON.stringify(details)) } });
}

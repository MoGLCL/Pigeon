import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function notifyUser(input: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.notification.create({ data: { ...input, metadata: input.metadata as Prisma.InputJsonValue | undefined } });
}

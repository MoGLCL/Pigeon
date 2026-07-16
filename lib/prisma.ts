import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const connectionString = process.env.DATABASE_URL ?? "postgresql://pigeon:pigeon_secret@localhost:5432/pigeon";
const positiveMilliseconds = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 3),
    connectionTimeoutMillis: positiveMilliseconds(process.env.DATABASE_CONNECT_TIMEOUT_MS, 30_000),
    idleTimeoutMillis: positiveMilliseconds(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
    query_timeout: positiveMilliseconds(process.env.DATABASE_QUERY_TIMEOUT_MS, 30_000),
    keepAlive: true,
  }),
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

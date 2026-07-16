import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
const connectionString = process.env.DATABASE_URL ?? "postgresql://pigeon:pigeon_secret@localhost:5432/pigeon";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
async function main() {
  const email = process.env.OWNER_EMAIL?.toLowerCase(); const username = process.env.OWNER_USERNAME?.toLowerCase(); const password = process.env.OWNER_PASSWORD;
  if (!email || !username || !password || password.length < 10) throw new Error("Set OWNER_EMAIL, OWNER_USERNAME and a strong OWNER_PASSWORD (10+ chars)");
  await prisma.user.upsert({ where: { email }, update: { username }, create: { email, username, passwordHash: await hash(password, 12), name: "Site Owner", role: "owner", status: "active" } });
  const settings = { site_name: "Pigeon", site_brand_display: "logo", archive_time: "00:00", archive_keep_live: "true", runtime_openwa_base_url: "http://openwa:2785/api" };
  await Promise.all(Object.entries(settings).map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })));
}
main().finally(() => prisma.$disconnect());

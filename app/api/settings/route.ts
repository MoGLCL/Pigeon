import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";

const schema = z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.string().max(2000));
const siteKeys = new Set(["site_name", "site_logo_url", "site_brand_display", "registration_open", "site_mode", "archive_time", "archive_keep_live"]);

export async function GET() {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const [personal, global] = await Promise.all([
    prisma.userSetting.findMany({ where: { userId: guard.user.id } }),
    guard.user.role === "owner" ? prisma.setting.findMany({ where: { key: { in: [...siteKeys] } } }) : Promise.resolve([]),
  ]);
  return Response.json(Object.fromEntries([...personal, ...global].map(row => [row.key, row.value])));
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Invalid settings", 422, parsed.error.flatten());
  if (parsed.data.site_brand_display && !["logo", "logo_name"].includes(parsed.data.site_brand_display)) return jsonError("Invalid brand display mode", 422);
  const globalEntries = Object.entries(parsed.data).filter(([key]) => siteKeys.has(key));
  const personalEntries = Object.entries(parsed.data).filter(([key]) => !siteKeys.has(key));
  if (guard.user.role !== "owner" && globalEntries.length) return jsonError("Owner permission required", 403);
  await prisma.$transaction([
    ...personalEntries.map(([key, value]) => prisma.userSetting.upsert({ where: { userId_key: { userId: guard.user.id, key } }, update: { value }, create: { userId: guard.user.id, key, value } })),
    ...globalEntries.map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })),
  ]);
  await writeAuditLog(guard.user.id, "settings.update", { keys: Object.keys(parsed.data) }, guard.user.id);
  return Response.json({ ok: true });
}

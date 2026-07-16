import { z } from "zod";
import { requireUser, jsonError, parseJson, sameOrigin } from "@/lib/api";
import {
  RUNTIME_CONFIG,
  runtimeConfigStatus,
  saveRuntimeConfig,
  type RuntimeConfigKey,
} from "@/lib/runtime-config";
import { writeAuditLog } from "@/lib/audit";
const schema = z.record(z.string(), z.string().max(2000));
function validValue(key: RuntimeConfigKey, value: string) {
  if (
    [
      "OPENWA_BASE_URL",
      "APP_URL",
      "FACEBOOK_CALLBACK_URL",
      "FACEBOOK_WEBHOOK_URL",
    ].includes(key)
  ) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return false;
      return (
        key !== "OPENWA_BASE_URL" ||
        url.pathname.replace(/\/$/, "").endsWith("/api")
      );
    } catch {
      return false;
    }
  }
  if (key === "FACEBOOK_CALLBACK_MODE")
    return ["auto", "manual"].includes(value);
  if (key === "FACEBOOK_GRAPH_VERSION") return /^v\d+\.\d+$/.test(value);
  if (key === "FACEBOOK_SYNC_PAGE_SIZE") return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100;
  if (key === "FACEBOOK_SYNC_MAX_PAGES") return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 200;
  if (key === "FACEBOOK_POST_INSIGHT_METRICS" || key === "FACEBOOK_AUDIENCE_INSIGHT_METRICS")
    return /^[a-z0-9_]+(?:\s*,\s*[a-z0-9_]+)*$/i.test(value);
  if (key === "OPENWA_PORT")
    return (
      /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 65535
    );
  if (key === "OPENWA_AUTO_START")
    return ["true", "false", "1", "0", "on", "off", "yes", "no"].includes(
      value.toLowerCase(),
    );
  if (
    [
      "OPENWA_WORKING_DIRECTORY",
      "OPENWA_START_COMMAND",
      "OPENWA_BROWSER_EXECUTABLE",
    ].includes(key)
  )
    return !/[\0\r\n]/.test(value);
  return true;
}
export async function GET() {
  const g = await requireUser(["owner"]);
  if ("error" in g) return g.error;
  return Response.json(await runtimeConfigStatus());
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const g = await requireUser(["owner"]);
  if ("error" in g) return g.error;
  const parsed = schema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Invalid configuration", 422);
  const entries = Object.entries(parsed.data)
    .filter(([key, value]) => key in RUNTIME_CONFIG && value !== "")
    .map(([key, value]) => [key, value.trim()] as [RuntimeConfigKey, string]);
  if (entries.some(([key, value]) => !validValue(key, value)))
    return jsonError("Invalid OpenWA configuration value", 422);
  await Promise.all(
    entries.map(([key, value]) => saveRuntimeConfig(key, value)),
  );
  await writeAuditLog(
    g.user.id,
    "runtime_config.update",
    { keys: entries.map(([key]) => key) },
    g.user.id,
  );
  return Response.json({ ok: true });
}

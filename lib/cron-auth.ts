import { timingSafeEqual } from "node:crypto";
import { runtimeConfig } from "./runtime-config";

export async function validCronRequest(request: Request) {
  const configured = await runtimeConfig("CRON_SECRET");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!configured || configured.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
}

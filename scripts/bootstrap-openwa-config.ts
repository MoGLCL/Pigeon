import "dotenv/config";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { runtimeConfig, saveRuntimeConfig } from "../lib/runtime-config";

async function main() {
  const installation = resolve(process.cwd(), "..", "OpenWA");
  const existingKey = await runtimeConfig("OPENWA_API_KEY");
  const apiKey = existingKey || randomBytes(48).toString("base64url");

  await Promise.all([
    saveRuntimeConfig("OPENWA_WORKING_DIRECTORY", installation),
    saveRuntimeConfig("OPENWA_BASE_URL", "http://127.0.0.1:2785/api"),
    saveRuntimeConfig("OPENWA_PORT", "2785"),
    saveRuntimeConfig("OPENWA_AUTO_START", "true"),
    saveRuntimeConfig("OPENWA_API_KEY", apiKey),
  ]);

  console.log(`OpenWA configuration saved (${existingKey ? "existing API key preserved" : "new API key generated"}).`);
}

main().finally(async () => prisma.$disconnect());

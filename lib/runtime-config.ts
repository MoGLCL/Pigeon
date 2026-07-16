import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

export const RUNTIME_CONFIG = {
  FACEBOOK_APP_ID: {
    label: "Facebook App ID",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_APP_ID",
    hint: "Create or select the Meta app used for Facebook Login and Page messaging.",
  },
  FACEBOOK_APP_SECRET: {
    label: "Facebook App Secret",
    group: "Facebook",
    secret: true,
    env: "FACEBOOK_APP_SECRET",
    hint: "Stored encrypted in the database.",
  },
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: {
    label: "Webhook verify token",
    group: "Facebook",
    secret: true,
    env: "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  },
  FACEBOOK_WEBHOOK_URL: {
    label: "Facebook webhook URL",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_WEBHOOK_URL",
  },
  FACEBOOK_CALLBACK_MODE: {
    label: "Facebook callback mode",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_CALLBACK_MODE",
    hint: "Automatic uses the public application URL. Manual uses the callback URL below.",
  },
  FACEBOOK_CALLBACK_URL: {
    label: "Manual Facebook callback URL",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_CALLBACK_URL",
    hint: "Used only when automatic callback is turned off.",
  },
  FACEBOOK_GRAPH_VERSION: {
    label: "Facebook Graph API version",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_GRAPH_VERSION",
    hint: "Version used for OAuth, Page subscriptions and Graph requests, for example v23.0.",
  },
  FACEBOOK_SYNC_PAGE_SIZE: {
    label: "Facebook sync page size",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_SYNC_PAGE_SIZE",
    hint: "Items requested per Graph page (1-100).",
  },
  FACEBOOK_SYNC_MAX_PAGES: {
    label: "Facebook sync page limit",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_SYNC_MAX_PAGES",
    hint: "Maximum pagination depth per historical collection.",
  },
  FACEBOOK_POST_INSIGHT_METRICS: {
    label: "Facebook post insight metrics",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_POST_INSIGHT_METRICS",
    hint: "Comma-separated Graph metrics used for post reach, impressions and engagement. Change these when Meta changes metric availability.",
  },
  FACEBOOK_AUDIENCE_INSIGHT_METRICS: {
    label: "Facebook audience insight metrics",
    group: "Facebook",
    secret: false,
    env: "FACEBOOK_AUDIENCE_INSIGHT_METRICS",
    hint: "Comma-separated Page audience metrics. Demographic results depend on Meta privacy thresholds and Page eligibility.",
  },
  OPENWA_BASE_URL: {
    label: "OpenWA API base URL",
    group: "OpenWA",
    secret: false,
    env: "OPENWA_BASE_URL",
    hint: "One shared rmyndharis/OpenWA deployment, including the /api prefix.",
  },
  OPENWA_PORT: {
    label: "OpenWA port",
    group: "OpenWA",
    secret: false,
    env: "OPENWA_PORT",
    hint: "Port used for the health check and the managed OpenWA process.",
  },
  OPENWA_API_KEY: {
    label: "OpenWA operator API key",
    group: "OpenWA",
    secret: true,
    env: "OPENWA_API_KEY",
    hint: "Sent by the server in the X-API-Key header and never exposed to users.",
  },
  OPENWA_WEBHOOK_SECRET: {
    label: "OpenWA webhook secret",
    group: "OpenWA",
    secret: true,
    env: "OPENWA_WEBHOOK_SECRET",
    hint: "Reserved for signed OpenWA webhook delivery.",
  },
  OPENWA_AUTO_START: {
    label: "Start OpenWA with Pigeon",
    group: "OpenWA",
    secret: false,
    env: "OPENWA_AUTO_START",
    hint: "Set to true or false. Existing external OpenWA services are always reused.",
  },
  OPENWA_WORKING_DIRECTORY: {
    label: "OpenWA installation directory",
    group: "OpenWA",
    secret: false,
    env: "OPENWA_WORKING_DIRECTORY",
    hint: "Absolute path to the existing rmyndharis/OpenWA checkout on Windows or Linux.",
  },
  OPENWA_START_COMMAND: {
    label: "OpenWA start command",
    group: "OpenWA",
    secret: false,
    env: "OPENWA_START_COMMAND",
    hint: "Optional command such as npm run start:prod. It is spawned directly without a shell.",
  },
  OPENWA_BROWSER_EXECUTABLE: {
    label: "OpenWA browser executable",
    group: "OpenWA",
    secret: false,
    env: "OPENWA_BROWSER_EXECUTABLE",
    hint: "Optional Chrome, Edge or Chromium executable. The server detects a local browser automatically when this is blank.",
  },
  RESEND_API_KEY: {
    label: "Resend API key",
    group: "Email",
    secret: true,
    env: "RESEND_API_KEY",
  },
  PASSWORD_RESET_FROM: {
    label: "Password reset sender",
    group: "Email",
    secret: false,
    env: "PASSWORD_RESET_FROM",
  },
  APP_URL: {
    label: "Public application URL",
    group: "Application",
    secret: false,
    env: "APP_URL",
  },
  ALLOW_DEV_RESET_LINK: {
    label: "Expose development reset link",
    group: "Application",
    secret: false,
    env: "ALLOW_DEV_RESET_LINK",
  },
  CRON_SECRET: {
    label: "Scheduled jobs secret",
    group: "Application",
    secret: true,
    env: "CRON_SECRET",
    hint: "Authenticates internal scheduled publishing, sync and cleanup jobs.",
  },
} as const;
export type RuntimeConfigKey = keyof typeof RUNTIME_CONFIG;
export const RUNTIME_DEFAULTS: Partial<Record<RuntimeConfigKey, string>> = {
  OPENWA_BASE_URL: "http://127.0.0.1:2785/api",
  OPENWA_PORT: "2785",
  OPENWA_AUTO_START: "true",
  FACEBOOK_CALLBACK_MODE: "auto",
  FACEBOOK_GRAPH_VERSION: "v23.0",
  FACEBOOK_SYNC_PAGE_SIZE: "100",
  FACEBOOK_SYNC_MAX_PAGES: "50",
  FACEBOOK_POST_INSIGHT_METRICS: "post_impressions,post_impressions_unique,post_engaged_users",
  FACEBOOK_AUDIENCE_INSIGHT_METRICS: "page_fans_gender_age,page_fans_country",
};
const dbKey = (key: RuntimeConfigKey) => `runtime_${key.toLowerCase()}`;
export async function runtimeConfig(key: RuntimeConfigKey) {
  const row = await prisma.setting.findUnique({ where: { key: dbKey(key) } });
  if (!row) return process.env[RUNTIME_CONFIG[key].env] || "";
  if (!RUNTIME_CONFIG[key].secret) return row.value;
  try {
    return decrypt(row.value.replace(/^enc:/, ""));
  } catch {
    return "";
  }
}
export async function saveRuntimeConfig(key: RuntimeConfigKey, value: string) {
  const stored = RUNTIME_CONFIG[key].secret ? `enc:${encrypt(value)}` : value;
  await prisma.setting.upsert({
    where: { key: dbKey(key) },
    update: { value: stored },
    create: { key: dbKey(key), value: stored },
  });
}
export async function runtimeConfigStatus() {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: (Object.keys(RUNTIME_CONFIG) as RuntimeConfigKey[]).map(dbKey),
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    (Object.keys(RUNTIME_CONFIG) as RuntimeConfigKey[]).map((key) => {
      const meta = RUNTIME_CONFIG[key],
        stored = map.get(dbKey(key));
      return [
        key,
        {
          ...meta,
          configured: Boolean(stored || process.env[meta.env]),
          value: meta.secret ? "" : (stored ?? process.env[meta.env] ?? ""),
        },
      ];
    }),
  );
}
export async function ensureRuntimeConfigDefaults() {
  await prisma.setting.updateMany({
    where: {
      id: "c6c0a001-0a01-4d00-9000-000000000101",
      key: dbKey("OPENWA_BASE_URL"),
      value: "http://openwa:2785/api",
    },
    data: { value: "http://127.0.0.1:2785/api" },
  });
  for (const [key, value] of Object.entries(RUNTIME_DEFAULTS) as [
    RuntimeConfigKey,
    string,
  ][]) {
    if (process.env[RUNTIME_CONFIG[key].env]) continue;
    await prisma.setting.upsert({
      where: { key: dbKey(key) },
      update: {},
      create: { key: dbKey(key), value },
    });
  }
}

import { runtimeConfig } from "@/lib/runtime-config";

function validHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function facebookCallbackUrl(requestUrl: string) {
  const [mode, manual, publicAppUrl] = await Promise.all([
    runtimeConfig("FACEBOOK_CALLBACK_MODE"),
    runtimeConfig("FACEBOOK_CALLBACK_URL"),
    runtimeConfig("APP_URL"),
  ]);
  if (mode === "manual" && validHttpUrl(manual)) return manual;
  const base = validHttpUrl(publicAppUrl)
    ? publicAppUrl
    : process.env.AUTH_URL || requestUrl;
  return new URL("/api/facebook/oauth/callback", base).toString();
}

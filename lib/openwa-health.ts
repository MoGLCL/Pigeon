import { runtimeConfig } from "@/lib/runtime-config";

export type OpenWaServiceHealth = {
  available: boolean;
  checkedAt: string;
};

export function openWaHealthUrl(baseUrl: string, configuredPort?: string) {
  const url = new URL(baseUrl);
  if (configuredPort) url.port = configuredPort;
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/health`;
  url.search = "";
  url.hash = "";
  return url;
}

export async function checkOpenWaHealth(options?: { baseUrl?: string; port?: string; timeoutMs?: number }): Promise<OpenWaServiceHealth> {
  const [baseUrl, port] = await Promise.all([
    options?.baseUrl ? Promise.resolve(options.baseUrl) : runtimeConfig("OPENWA_BASE_URL"),
    options?.port !== undefined ? Promise.resolve(options.port) : runtimeConfig("OPENWA_PORT"),
  ]);
  const checkedAt = new Date().toISOString();
  if (!baseUrl) return { available: false, checkedAt };

  try {
    const response = await fetch(openWaHealthUrl(baseUrl, port), {
      cache: "no-store",
      signal: AbortSignal.timeout(options?.timeoutMs ?? 2500),
    });
    if (!response.ok) return { available: false, checkedAt };
    const body = await response.json().catch(() => null) as { status?: string } | null;
    return { available: body?.status === "ok", checkedAt };
  } catch {
    return { available: false, checkedAt };
  }
}

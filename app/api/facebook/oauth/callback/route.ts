import axios from "axios";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { saveFacebookCandidates } from "@/lib/facebook-oauth";
import { runtimeConfig } from "@/lib/runtime-config";
import { facebookCallbackUrl } from "@/lib/facebook-callback";

export async function GET(request: Request) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const url = new URL(request.url),
    state = url.searchParams.get("state"),
    jar = await cookies();
  if (!state || state !== jar.get("pigeon_fb_oauth")?.value)
    return jsonError("Invalid OAuth state", 403);
  const code = url.searchParams.get("code");
  if (!code) return jsonError("Facebook authorization was cancelled", 400);
  const redirectUri = await facebookCallbackUrl(request.url);
  const [clientId, clientSecret, configuredVersion] = await Promise.all([
    runtimeConfig("FACEBOOK_APP_ID"),
    runtimeConfig("FACEBOOK_APP_SECRET"),
    runtimeConfig("FACEBOOK_GRAPH_VERSION"),
  ]);
  if (!clientId || !clientSecret)
    return NextResponse.redirect(
      new URL("/facebook?error=not-configured", request.url),
    );
  const graphVersion = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : "v23.0";
  const graphBase = `https://graph.facebook.com/${graphVersion}`;
  const token = await axios.get<{ access_token: string }>(
    `${graphBase}/oauth/access_token`,
    {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
    },
  );
  const pages = await axios.get<{
    data: {
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
    }[];
  }>(`${graphBase}/me/accounts`, {
    params: {
      fields: "id,name,access_token,picture",
      access_token: token.data.access_token,
    },
  });
  const permissions = await axios
    .get<{ data: { permission: string; status: string }[] }>(
      `${graphBase}/me/permissions`,
      { params: { access_token: token.data.access_token } },
    )
    .then((r) =>
      r.data.data
        .filter((x) => x.status === "granted")
        .map((x) => x.permission),
    )
    .catch(() => [] as string[]);
  const expiresAt = await axios
    .get<{
      data: { expires_at?: number; data_access_expiration_time?: number };
    }>(`${graphBase}/debug_token`, {
      params: {
        input_token: token.data.access_token,
        access_token: `${clientId}|${clientSecret}`,
      },
    })
    .then(
      (r) => r.data.data.expires_at || r.data.data.data_access_expiration_time,
    )
    .catch(() => undefined);
  await saveFacebookCandidates(
    guard.user.id,
    pages.data.data.map((page) => ({
      pageId: page.id,
      name: page.name,
      accessToken: page.access_token,
      avatarUrl: page.picture?.data?.url,
      tokenExpiresAt: expiresAt
        ? new Date(expiresAt * 1000).toISOString()
        : undefined,
      grantedPermissions: permissions,
    })),
  );
  await writeAuditLog(
    guard.user.id,
    "facebook.oauth.authorized",
    { availablePages: pages.data.data.map((page) => page.id) },
    guard.user.id,
  );
  jar.delete("pigeon_fb_oauth");
  return NextResponse.redirect(new URL("/facebook?select=1", request.url));
}

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { runtimeConfig } from "@/lib/runtime-config";
import { facebookCallbackUrl } from "@/lib/facebook-callback";

export async function GET(request: Request) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const [clientId, configuredVersion] = await Promise.all([runtimeConfig("FACEBOOK_APP_ID"), runtimeConfig("FACEBOOK_GRAPH_VERSION")]);
  if (!clientId)
    return NextResponse.redirect(
      new URL("/facebook?error=not-configured", request.url),
    );
  const state = randomBytes(24).toString("hex");
  const callback = await facebookCallbackUrl(request.url);
  const graphVersion = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : "v23.0";
  const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    "pages_show_list,pages_manage_posts,pages_messaging,pages_read_engagement,pages_read_user_content,pages_manage_metadata,read_insights",
  );
  const response = NextResponse.redirect(url);
  response.cookies.set("pigeon_fb_oauth", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}

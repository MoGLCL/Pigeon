import axios from "axios";
import { z } from "zod";
import { encrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { clearFacebookCandidates, getFacebookCandidates } from "@/lib/facebook-oauth";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { runtimeConfig } from "@/lib/runtime-config";
import { syncFacebookConversations, syncFacebookPage } from "@/lib/facebook";

const schema = z.object({ pageIds: z.array(z.string().min(1)).min(1).max(100) });

export async function GET() {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const pages = await getFacebookCandidates(guard.user.id);
  return Response.json(pages.map(({ accessToken, ...page }) => page));
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Select at least one Facebook Page", 422);
  const pending = await getFacebookCandidates(guard.user.id), selected = new Set(parsed.data.pageIds), pages = pending.filter((page) => selected.has(page.pageId));
  if (pages.length !== selected.size) return jsonError("The Facebook Page selection expired. Connect again.", 409);
  const configuredVersion = await runtimeConfig("FACEBOOK_GRAPH_VERSION");
  const graphVersion = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : "v23.0";
  const connected: string[] = [], failed: string[] = [], sync: Record<string, unknown> = {};
  for (const page of pages) {
    try {
      await axios.post(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(page.pageId)}/subscribed_apps`, null, {
        params: { subscribed_fields: "messages,messaging_postbacks,feed", access_token: page.accessToken },
        timeout: 15000,
      });
      const saved = await prisma.facebookPage.upsert({
        where: { ownerId_pageId: { ownerId: guard.user.id, pageId: page.pageId } },
        update: { name: page.name, accessTokenEnc: encrypt(page.accessToken), avatarUrl: page.avatarUrl, tokenExpiresAt: page.tokenExpiresAt ? new Date(page.tokenExpiresAt) : null, grantedPermissions: page.grantedPermissions, status: "connected", webhookVerified: true, connectedAt: new Date() },
        create: { ownerId: guard.user.id, pageId: page.pageId, name: page.name, accessTokenEnc: encrypt(page.accessToken), avatarUrl: page.avatarUrl, tokenExpiresAt: page.tokenExpiresAt ? new Date(page.tokenExpiresAt) : null, grantedPermissions: page.grantedPermissions, status: "connected", webhookVerified: true },
      });
      connected.push(page.pageId);
      const [posts, messenger] = await Promise.allSettled([syncFacebookPage(saved.id), syncFacebookConversations(saved.id)]);
      sync[page.pageId] = {
        posts: posts.status === "fulfilled" ? posts.value : 0,
        messenger: messenger.status === "fulfilled" ? messenger.value : { conversations: 0, messages: 0 },
        warnings: [posts, messenger].filter((item) => item.status === "rejected").length,
      };
    } catch (error) {
      console.error("Facebook Page connection failed", page.pageId, error);
      failed.push(page.pageId);
    }
  }
  if (connected.length) await writeAuditLog(guard.user.id, "facebook.pages.connect", { pageIds: connected, sync }, guard.user.id);
  if (!failed.length) await clearFacebookCandidates(guard.user.id);
  if (!connected.length) return jsonError("Facebook could not subscribe the selected Page. Check the app permissions and try again.", 502);
  return Response.json({ connected, failed, sync }, { status: failed.length ? 207 : 201 });
}

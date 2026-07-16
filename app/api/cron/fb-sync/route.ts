import { prisma } from "@/lib/prisma";
import { facebookRequest, syncFacebookConversations, syncFacebookPage } from "@/lib/facebook";
import { jsonError } from "@/lib/api";
import { validCronRequest } from "@/lib/cron-auth";
export async function POST(request: Request) {
  if (!await validCronRequest(request)) return jsonError("Unauthorized", 401);
  const pages = await prisma.facebookPage.findMany(); let synced = 0; const warnings: { pageId: string; area: string }[] = [];
  for (const page of pages) {
    const [profile, posts, messenger] = await Promise.allSettled([
      facebookRequest<{ followers_count?: number; picture?: { data?: { url?: string } } }>(page.id, "/me", "GET", { fields: "followers_count,picture" }),
      syncFacebookPage(page.id), syncFacebookConversations(page.id),
    ]);
    if (profile.status === "fulfilled") { await prisma.facebookPage.update({ where: { id: page.id }, data: { followersCount: profile.value.followers_count, avatarUrl: profile.value.picture?.data?.url } }); synced++; }
    for (const [area, result] of [["profile", profile], ["posts", posts], ["messenger", messenger]] as const) if (result.status === "rejected") { warnings.push({ pageId: page.id, area }); console.error(`Facebook ${area} sync failed`, page.id, result.reason instanceof Error ? result.reason.message : result.reason); }
  }
  return Response.json({ checked: pages.length, synced, warnings });
}

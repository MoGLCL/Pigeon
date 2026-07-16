import axios from "axios";
import { jsonError, requireUser } from "@/lib/api";
import { decrypt } from "@/lib/encryption";
import { facebookRequest, syncFacebookPostComments } from "@/lib/facebook";
import { prisma } from "@/lib/prisma";
import { runtimeConfig } from "@/lib/runtime-config";

type GraphPostDetails = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
};
type GraphInsight = {
  name: string;
  title?: string;
  description?: string;
  values?: { value?: number | Record<string, number>; end_time?: string }[];
};

const messageFor = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const graphMessage = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    return graphMessage || error.message;
  }
  return error instanceof Error ? error.message : "Facebook data is unavailable";
};
const configuredMetrics = async (key: "FACEBOOK_POST_INSIGHT_METRICS" | "FACEBOOK_AUDIENCE_INSIGHT_METRICS") =>
  (await runtimeConfig(key)).split(",").map((metric) => metric.trim()).filter(Boolean).join(",");
const latestValue = (metric: GraphInsight) => metric.values?.at(-1)?.value;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const post = await prisma.facebookPost.findFirst({
    where: { id: (await params).id, page: { ownerId: guard.user.id } },
    include: { page: { select: { id: true, name: true, avatarUrl: true, grantedPermissions: true } } },
  });
  if (!post) return jsonError("Post not found", 404);

  const warnings: string[] = [];
  let live: GraphPostDetails | null = null;
  if (post.externalId) {
    try {
      live = await facebookRequest<GraphPostDetails>(post.pageId, `/${encodeURIComponent(post.externalId)}`, "GET", {
        fields: "id,message,created_time,permalink_url,full_picture,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)",
      });
      const mediaUrls = live.full_picture ? [live.full_picture] : post.mediaUrls;
      await prisma.facebookPost.update({
        where: { id: post.id },
        data: {
          content: live.message || post.content,
          mediaUrls,
          reactions: live.reactions?.summary?.total_count ?? post.reactions,
          commentsCount: live.comments?.summary?.total_count ?? post.commentsCount,
          shares: live.shares?.count ?? post.shares,
        },
      });
    } catch (error) {
      warnings.push(`Live post details: ${messageFor(error)}`);
    }
    try {
      await syncFacebookPostComments(post.pageId, post.externalId);
    } catch (error) {
      warnings.push(`Comments: ${messageFor(error)}`);
    }
  }

  let postInsights: GraphInsight[] = [], postInsightsError = "";
  if (post.externalId) {
    try {
      const metric = await configuredMetrics("FACEBOOK_POST_INSIGHT_METRICS");
      const response = await facebookRequest<{ data?: GraphInsight[] }>(post.pageId, `/${encodeURIComponent(post.externalId)}/insights`, "GET", { metric });
      postInsights = response.data ?? [];
    } catch (error) {
      postInsightsError = messageFor(error);
    }
  }

  let audienceInsights: GraphInsight[] = [], audienceError = "";
  try {
    const metric = await configuredMetrics("FACEBOOK_AUDIENCE_INSIGHT_METRICS");
    const response = await facebookRequest<{ data?: GraphInsight[] }>(post.pageId, "/me/insights", "GET", { metric, period: "lifetime" });
    audienceInsights = response.data ?? [];
  } catch (error) {
    audienceError = messageFor(error);
  }

  const genderAge = audienceInsights.find((metric) => metric.name.includes("gender_age"));
  const countryMetric = audienceInsights.find((metric) => metric.name.includes("country"));
  const genderAgeValue = latestValue(genderAge || { name: "" });
  const countryValue = latestValue(countryMetric || { name: "" });
  const genderTotals = new Map<string, number>(), ageTotals = new Map<string, number>();
  if (genderAgeValue && typeof genderAgeValue === "object") {
    for (const [bucket, count] of Object.entries(genderAgeValue)) {
      const [gender = "U", age = "Unknown"] = bucket.split(".");
      genderTotals.set(gender, (genderTotals.get(gender) || 0) + Number(count || 0));
      ageTotals.set(age, (ageTotals.get(age) || 0) + Number(count || 0));
    }
  }
  const countries = countryValue && typeof countryValue === "object"
    ? Object.entries(countryValue).map(([label, value]) => ({ label, value: Number(value || 0) })).sort((a, b) => b.value - a.value).slice(0, 12)
    : [];
  const metrics = postInsights.map((metric) => {
    const value = latestValue(metric);
    return { name: metric.name, label: metric.title || metric.name.replaceAll("_", " "), description: metric.description || "", value: typeof value === "number" ? value : null };
  });
  const primaryMetric = metrics.find((metric) => /view/i.test(metric.name))
    || metrics.find((metric) => /impression/i.test(metric.name))
    || metrics.find((metric) => /reach/i.test(metric.name));
  const comments = await prisma.facebookComment.findMany({
    where: { pageId: post.pageId, postId: post.externalId || undefined, archived: false },
    include: { page: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { postedAt: "desc" },
    take: 500,
  });
  return Response.json({
    post: {
      ...post,
      content: live?.message || post.content,
      mediaUrls: live?.full_picture ? [live.full_picture] : post.mediaUrls,
      reactions: live?.reactions?.summary?.total_count ?? post.reactions,
      commentsCount: live?.comments?.summary?.total_count ?? post.commentsCount,
      shares: live?.shares?.count ?? post.shares,
      permalinkUrl: live?.permalink_url || null,
    },
    comments: comments.map(({ contentEnc, ...comment }) => ({ ...comment, content: decrypt(contentEnc) })),
    insights: {
      available: metrics.some((metric) => metric.value !== null),
      primary: primaryMetric || null,
      metrics,
      error: postInsightsError || null,
    },
    audience: {
      available: genderTotals.size > 0 || ageTotals.size > 0 || countries.length > 0,
      gender: [...genderTotals].map(([label, value]) => ({ label, value })),
      ages: [...ageTotals].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
      countries,
      error: audienceError || null,
    },
    warnings,
  });
}

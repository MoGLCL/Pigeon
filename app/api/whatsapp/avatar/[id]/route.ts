import { getOpenWaConversationAvatar } from "@/lib/openwa-runtime";
import { jsonError, requireUser } from "@/lib/api";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const { id } = await params;

  for (const force of [false, true]) {
    const url = await getOpenWaConversationAvatar(id, guard.user.id, force);
    if (!url || !/^https:\/\//i.test(url)) continue;
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    const contentType = response?.headers.get("content-type") || "";
    if (response?.ok && contentType.startsWith("image/")) {
      return new Response(await response.arrayBuffer(), {
        headers: {
          "content-type": contentType,
          "cache-control": "private, max-age=1800",
        },
      });
    }
  }
  return jsonError("Profile picture is not available", 404);
}

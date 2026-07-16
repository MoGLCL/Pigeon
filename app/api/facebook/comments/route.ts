import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { resolveFacebookCommentAuthor } from "@/lib/facebook";
import { jsonError, requireUser } from "@/lib/api";

export async function GET(request: Request) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const pageId = new URL(request.url).searchParams.get("pageId") || undefined;
  if (pageId && !await prisma.facebookPage.findFirst({
    where: { id: pageId, ownerId: guard.user.id },
    select: { id: true },
  })) return jsonError("Page not found", 404);

  const comments = await prisma.facebookComment.findMany({
    where: { pageId, page: { ownerId: guard.user.id } },
    include: { page: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { postedAt: "desc" },
    take: 100,
  });
  const hydrated = await Promise.all(comments.map(async (comment) => {
    if ((!comment.authorName || !comment.authorAvatarUrl) && comment.authorId) {
      const author = await resolveFacebookCommentAuthor(comment.pageId, comment.authorId);
      if (author?.name || author?.avatarUrl) {
        return prisma.facebookComment.update({
          where: { id: comment.id },
          data: {
            authorName: author.name || comment.authorName,
            authorAvatarUrl: author.avatarUrl || comment.authorAvatarUrl,
          },
          include: { page: { select: { id: true, name: true, avatarUrl: true } } },
        });
      }
    }
    return comment;
  }));
  return Response.json(hydrated.map(({ contentEnc, ...comment }) => ({
    ...comment,
    content: decrypt(contentEnc),
  })));
}

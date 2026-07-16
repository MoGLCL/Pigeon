import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { facebookImageRequest, facebookRequest, saveFacebookMessage } from "@/lib/facebook";
import { jsonError, requireUser, sameOrigin } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { removeWhatsAppImage, saveWhatsAppImage } from "@/lib/whatsapp-media";

const fields = z.object({ pageId: z.string().uuid(), conversationExternalId: z.string().min(1), recipientId: z.string().min(1), message: z.string().max(2000).default("") });
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  if (!rateLimit(`messenger-image:${guard.user.id}:${clientIp(request)}`, 15, 60000).allowed) return jsonError("Too many image messages", 429);
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Invalid image upload", 422);
  const parsed = fields.safeParse({ pageId: form.get("pageId"), conversationExternalId: form.get("conversationExternalId"), recipientId: form.get("recipientId"), message: form.get("message") || "" });
  const image = form.get("image");
  if (!parsed.success || !(image instanceof File) || !ALLOWED.has(image.type) || image.size < 1 || image.size > 8 * 1024 * 1024) return jsonError("Choose a JPG, PNG, WebP or GIF image up to 8 MB", 422);
  const conversation = await prisma.facebookConversation.findFirst({ where: { externalId: parsed.data.conversationExternalId, participantId: parsed.data.recipientId, pageId: parsed.data.pageId, page: { ownerId: guard.user.id } }, select: { id: true } });
  if (!conversation) return jsonError("Conversation not found", 404);
  let localToken = "";
  try {
    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const result = await facebookImageRequest(parsed.data.pageId, parsed.data.recipientId, image);
    if (parsed.data.message) await facebookRequest(parsed.data.pageId, "/me/messages", "POST", { recipient: { id: parsed.data.recipientId }, message: { text: parsed.data.message } });
    const stored = await saveWhatsAppImage(base64, image.type);
    localToken = stored.token;
    const attachments = { data: [{ type: "image", attachmentId: result.attachment_id, localToken }] };
    const saved = await saveFacebookMessage({ pageId: parsed.data.pageId, conversationExternalId: parsed.data.conversationExternalId, messageExternalId: result.message_id, content: parsed.data.message || "[Image]", fromPage: true, sentAt: new Date(), attachments });
    return Response.json({
      ok: true,
      message: { id: saved.id, content: parsed.data.message || "[Image]", sentAt: saved.sentAt, fromPage: true, attachments },
    });
  } catch (error) {
    if (localToken) await removeWhatsAppImage(localToken);
    return jsonError(error instanceof Error ? error.message : "Image could not be sent", 502);
  }
}

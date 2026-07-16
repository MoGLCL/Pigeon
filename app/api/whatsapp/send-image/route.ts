import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { saveWhatsAppMessage } from "@/lib/openwa";
import { sendOpenWaImage } from "@/lib/openwa-runtime";
import {
  removeWhatsAppImage,
  saveWhatsAppImage,
  supportedWhatsAppImageType,
} from "@/lib/whatsapp-media";
import { jsonError, requireUser, sameOrigin } from "@/lib/api";
import { INTERNATIONAL_PHONE_PATTERN } from "@/lib/phone";

const text = z.object({
  accountId: z.string().uuid(),
  phone: z.string().regex(INTERNATIONAL_PHONE_PATTERN),
  caption: z.string().trim().max(1024),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const form = await request.formData();
  const parsed = text.safeParse({
    accountId: form.get("accountId"),
    phone: form.get("phone"),
    caption: form.get("caption") || "",
  });
  const file = form.get("image");
  if (!parsed.success || !(file instanceof File))
    return jsonError("Choose a valid image and recipient", 422);
  if (!supportedWhatsAppImageType(file.type) || file.size > 8 * 1024 * 1024)
    return jsonError(
      "Use a JPG, PNG, WebP or GIF image smaller than 8 MB",
      422,
    );
  const account = await prisma.whatsAppAccount.findFirst({
    where: {
      id: parsed.data.accountId,
      ownerId: guard.user.id,
      status: "connected",
    },
    select: { id: true },
  });
  if (!account) return jsonError("Connected account not found", 404);

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const stored = await saveWhatsAppImage(base64, file.type);
  // Match against server creation time; device timestamps may be skewed.
  const sendStartedAt = new Date(Date.now() - 5000);
  try {
    const result = await sendOpenWaImage(account.id, parsed.data.phone, {
      base64,
      mimetype: file.type,
      filename: file.name.slice(0, 255) || "image",
      caption: parsed.data.caption,
    });
    const message = await saveWhatsAppMessage({
      accountId: account.id,
      contactPhone: parsed.data.phone,
      externalId: result.messageId,
      fromMe: true,
      content: parsed.data.caption || undefined,
      type: "image",
      mediaUrl: stored.token,
      status: "sent",
      sentAt: new Date(result.timestamp * 1000),
    });
    return Response.json({
      ok: true,
      message: {
        id: message.id,
        content: parsed.data.caption || null,
        type: "image",
        fromMe: true,
        sentAt: message.sentAt,
        status: message.status,
        mediaUrl: message.mediaUrl,
      },
    });
  } catch (error) {
    // whatsapp-web.js can emit message_create (and the recipient can receive the
    // image) before its REST send promise rejects. Preserve the upload and attach
    // it to that authoritative event row instead of deleting the only local copy.
    const eventMessage = await waitForOutgoingImageEvent({
      accountId: account.id,
      phone: parsed.data.phone,
      sentAfter: sendStartedAt,
    });
    if (eventMessage) {
      const message = await prisma.whatsAppMessage.update({
        where: { id: eventMessage.id },
        data: { mediaUrl: stored.token },
      });
      return Response.json({
        ok: true,
        deliveryPending: true,
        message: {
          id: message.id,
          content: parsed.data.caption || null,
          type: "image",
          fromMe: true,
          sentAt: message.sentAt,
          status: message.status,
          mediaUrl: message.mediaUrl,
        },
      });
    }
    await removeWhatsAppImage(stored.token);
    return jsonError(
      error instanceof Error ? error.message : "Image could not be sent",
      502,
    );
  }
}

async function waitForOutgoingImageEvent(input: {
  accountId: string;
  phone: string;
  sentAfter: Date;
}) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const message = await prisma.whatsAppMessage.findFirst({
      where: {
        fromMe: true,
        type: "image",
        mediaUrl: null,
        createdAt: { gte: input.sentAfter },
        conversation: {
          accountId: input.accountId,
          contactPhone: input.phone,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

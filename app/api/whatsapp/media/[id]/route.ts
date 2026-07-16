import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/api";
import { readWhatsAppImage } from "@/lib/whatsapp-media";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const message = await prisma.whatsAppMessage.findFirst({
    where: { id, conversation: { account: { ownerId: guard.user.id } } },
    select: { mediaUrl: true },
  });
  if (!message?.mediaUrl) return jsonError("Image not found", 404);
  const image = await readWhatsAppImage(message.mediaUrl).catch(() => null);
  if (!image) return jsonError("Image not found", 404);
  return new Response(image.bytes, {
    headers: {
      "content-type": image.mimetype,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

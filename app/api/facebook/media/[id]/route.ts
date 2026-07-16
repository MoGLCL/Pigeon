import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/api";
import { readWhatsAppImage } from "@/lib/whatsapp-media";

function localToken(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return "";
  for (const item of data) {
    if (item && typeof item === "object" && typeof (item as { localToken?: unknown }).localToken === "string")
      return (item as { localToken: string }).localToken;
  }
  return "";
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const message = await prisma.facebookMessage.findFirst({
    where: { id: (await params).id, conversation: { page: { ownerId: guard.user.id } } },
    select: { attachments: true },
  });
  const token = localToken(message?.attachments);
  if (!token) return jsonError("Image not found", 404);
  const image = await readWhatsAppImage(token).catch(() => null);
  if (!image) return jsonError("Image not found", 404);
  return new Response(image.bytes, { headers: { "content-type": image.mimetype, "cache-control": "private, max-age=31536000, immutable" } });
}

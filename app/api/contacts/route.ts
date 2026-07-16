import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { contactSchema } from "@/lib/validators/features.schema";
export async function GET(request: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const q = new URL(request.url).searchParams.get("q")?.trim();
  return Response.json(
    await prisma.contact.findMany({
      where: {
        userId: g.user.id,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { tags: true },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    }),
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const g = await requireUser();
  if ("error" in g) return g.error;
  const p = contactSchema.safeParse(await parseJson(request));
  if (!p.success) return jsonError("Invalid contact", 422, p.error.flatten());
  const { tags, email, ...data } = p.data;
  const item = await prisma.contact.create({
    data: {
      ...data,
      userId: g.user.id,
      email: email || null,
      source: "manual",
      tags: { create: tags.map((tag) => ({ tag })) },
    },
    include: { tags: true },
  });
  return Response.json(item, { status: 201 });
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const g = await requireUser();
  if ("error" in g) return g.error;
  const p = contactSchema
    .pick({ name: true, phone: true }).extend({ conversationId: z.string().uuid().optional() })
    .safeParse(await parseJson(request));
  if (!p.success) return jsonError("Invalid contact", 422, p.error.flatten());
  const conversation = p.data.conversationId ? await prisma.whatsAppConversation.findFirst({ where: { id: p.data.conversationId, account: { ownerId: g.user.id } }, select: { contactAvatarUrl: true } }) : null;
  const item = await prisma.contact.upsert({
    where: { userId_phone: { userId: g.user.id, phone: p.data.phone } },
    update: { name: p.data.name || undefined, avatarUrl: conversation?.contactAvatarUrl || undefined, source: "manual" },
    create: {
      userId: g.user.id,
      phone: p.data.phone,
      name: p.data.name,
      avatarUrl: conversation?.contactAvatarUrl,
      source: "manual",
    },
  });
  return Response.json(item);
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const g = await requireUser();
  if ("error" in g) return g.error;
  const parsed = z
    .object({
      ids: z.array(z.string().uuid()).max(500).optional(),
      all: z.boolean().optional(),
    })
    .refine(
      (value) => value.all === true || Boolean(value.ids?.length),
      "Select contacts to delete",
    )
    .safeParse(await parseJson(request));
  if (!parsed.success)
    return jsonError("Select contacts to delete", 422, parsed.error.flatten());
  const owned = await prisma.contact.findMany({
    where: {
      userId: g.user.id,
      ...(parsed.data.all ? {} : { id: { in: parsed.data.ids } }),
    },
    select: { id: true },
  });
  const ids = owned.map((item) => item.id);
  if (!ids.length) return Response.json({ ok: true, deleted: 0 });
  await prisma.$transaction([
    prisma.broadcastRecipient.updateMany({
      where: { contactId: { in: ids } },
      data: { contactId: null },
    }),
    prisma.contact.deleteMany({
      where: { id: { in: ids }, userId: g.user.id },
    }),
  ]);
  return Response.json({ ok: true, deleted: ids.length });
}

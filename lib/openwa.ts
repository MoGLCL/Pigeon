import { prisma } from "./prisma";
import { encrypt } from "./encryption";
import { notifyUser } from "./notifications";
import { autoAddWhatsAppContacts } from "./whatsapp-preferences";

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function qrImageSource(qr: string) {
  if (qr.startsWith("data:image/") || /^https?:\/\//i.test(qr)) return qr;
  return `data:image/png;base64,${qr.replace(/^base64,/, "")}`;
}

export function normaliseOpenWaState(value: string) {
  const state = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    [
      "connected",
      "authenticated",
      "starting",
      "waiting_for_qr",
      "disconnected",
      "reconnecting",
      "logged_out",
      "error",
    ].includes(state)
  )
    return state;
  if (["open", "ready", "success", "islogged"].includes(state))
    return "connected";
  if (["pairing", "qr", "unpaired"].includes(state)) return "waiting_for_qr";
  if (["opening", "initializing", "initialising"].includes(state))
    return "starting";
  if (
    [
      "conflict",
      "timeout",
      "unlaunched",
      "deprecated_version",
      "proxyblock",
      "smb_tos_block",
      "tos_block",
    ].includes(state)
  )
    return "disconnected";
  return state;
}

export async function saveWhatsAppMessage(input: {
  accountId: string;
  contactPhone: string;
  contactJid?: string;
  contactName?: string;
  contactAvatarUrl?: string;
  externalId?: string;
  fromMe: boolean;
  content?: string;
  type?: string;
  mediaUrl?: string;
  status?: string;
  sentAt: Date;
}) {
  const accountOwner = await prisma.whatsAppAccount.findUniqueOrThrow({
    where: { id: input.accountId },
    select: { ownerId: true, createdAt: true },
  });
  const allowAutomaticContact =
    !input.fromMe &&
    input.sentAt >= accountOwner.createdAt &&
    (await autoAddWhatsAppContacts(accountOwner.ownerId));
  let result;
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const account = await tx.whatsAppAccount.findUniqueOrThrow({
          where: { id: input.accountId },
          select: { ownerId: true, sessionName: true, createdAt: true },
        });
        const conversation = await tx.whatsAppConversation.upsert({
          where: {
            accountId_contactPhone: {
              accountId: input.accountId,
              contactPhone: input.contactPhone,
            },
          },
          update: {
            contactJid: input.contactJid,
            contactName: input.contactName,
            contactAvatarUrl: input.contactAvatarUrl,
            lastMessageAt: input.sentAt,
            hiddenAt: null,
            unreadCount: { increment: input.fromMe ? 0 : 1 },
          },
          create: {
            accountId: input.accountId,
            contactPhone: input.contactPhone,
            contactJid: input.contactJid,
            contactName: input.contactName,
            contactAvatarUrl: input.contactAvatarUrl,
            lastMessageAt: input.sentAt,
            unreadCount: input.fromMe ? 0 : 1,
          },
        });
        const savedContact = await tx.contact.findUnique({
          where: {
            userId_phone: {
              userId: account.ownerId,
              phone: input.contactPhone,
            },
          },
        });
        if (savedContact)
          await tx.contact.update({
            where: { id: savedContact.id },
            data: {
              ...(savedContact.source === "manual" && savedContact.name
                ? {}
                : { name: input.contactName }),
              avatarUrl: input.contactAvatarUrl,
              lastMessageAt: input.sentAt,
            },
          });
        else if (allowAutomaticContact)
          await tx.contact.create({
            data: {
              userId: account.ownerId,
              phone: input.contactPhone,
              name: input.contactName,
              avatarUrl: input.contactAvatarUrl,
              source: "whatsapp",
              lastMessageAt: input.sentAt,
            },
          });
        const message = await tx.whatsAppMessage.create({
          data: {
            conversationId: conversation.id,
            externalId: input.externalId,
            fromMe: input.fromMe,
            contentEnc: input.content ? encrypt(input.content) : null,
            type: input.type ?? "text",
            mediaUrl: input.mediaUrl,
            status: input.status ?? "sent",
            sentAt: input.sentAt,
          },
        });
        return {
          message,
          conversationId: conversation.id,
          ownerId: account.ownerId,
          accountName: account.sessionName,
          connectedAt: account.createdAt,
        };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (input.externalId && isUniqueConstraintError(error)) {
      const existing = await prisma.whatsAppMessage.findFirstOrThrow({
        where: {
          externalId: input.externalId,
          conversation: { accountId: input.accountId },
        },
      });
      // OpenWA can emit message.sent before the REST send request resolves. In that
      // race the event creates the row first without the locally uploaded media.
      // Merge the richer request payload into the existing row instead of returning
      // a permanently image-less message.
      return prisma.whatsAppMessage.update({
        where: { id: existing.id },
        data: {
          ...(input.content ? { contentEnc: encrypt(input.content) } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
          ...(input.status ? { status: input.status } : {}),
          sentAt: input.sentAt,
        },
      });
    }
    throw error;
  }
  if (!input.fromMe && input.sentAt >= result.connectedAt) {
    await notifyUser({
      userId: result.ownerId,
      type: "whatsapp_message",
      title: `New WhatsApp message from ${input.contactName || input.contactPhone}`,
      body: input.content?.slice(0, 180),
      metadata: {
        href: `/whatsapp/chat/${result.conversationId}`,
        conversationId: result.conversationId,
        accountId: input.accountId,
        accountName: result.accountName,
      },
    });
    const { runAutomation } = await import("./automation");
    await runAutomation({
      channel: "whatsapp",
      trigger: "new_message",
      text: input.content || "",
      accountId: input.accountId,
      recipient: input.contactPhone,
      receivedAt: input.sentAt,
    });
  }
  return result.message;
}

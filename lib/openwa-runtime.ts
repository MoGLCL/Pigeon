import { prisma } from "@/lib/prisma";
import { runtimeConfig } from "@/lib/runtime-config";
import { saveWhatsAppMessage } from "@/lib/openwa";
import { saveWhatsAppImage } from "@/lib/whatsapp-media";

type OpenWaStatus =
  | "created"
  | "initializing"
  | "qr_ready"
  | "authenticating"
  | "ready"
  | "disconnected"
  | "failed";
type OpenWaSession = {
  id: string;
  name: string;
  status: OpenWaStatus;
  phone: string | null;
  pushName: string | null;
  connectedAt: string | null;
  lastActive?: string | null;
  lastError?: string | null;
};
type OpenWaQr = { qrCode: string; status: OpenWaStatus };
type OpenWaMessage = {
  id: string;
  waMessageId: string | null;
  chatId: string;
  from: string;
  to: string;
  body: string | null;
  type: string;
  direction: "incoming" | "outgoing";
  timestamp: number | null;
  status: string;
  media?: OpenWaMedia;
  metadata?: { media?: OpenWaMedia };
  contact?: {
    name?: string | null;
    pushName?: string | null;
    shortName?: string | null;
    number?: string | null;
  };
};
type OpenWaMedia = {
  mimetype: string;
  filename?: string;
  data?: string;
  omitted?: boolean;
};
type OpenWaLiveMessage = {
  id: string;
  messageId?: string;
  chatId: string;
  from: string;
  to: string;
  body?: string | null;
  type?: string;
  timestamp?: number;
  fromMe?: boolean;
  isGroup?: boolean;
  isStatusBroadcast?: boolean;
  senderPhone?: string | null;
  status?: string;
  media?: {
    mimetype: string;
    filename?: string;
    data?: string;
    omitted?: boolean;
  };
  contact?: {
    name?: string | null;
    pushName?: string | null;
    shortName?: string | null;
    number?: string | null;
  };
};
type OpenWaContact = {
  id: string;
  name?: string | null;
  pushName?: string | null;
  number?: string | null;
  profilePicUrl?: string | null;
};
type OpenWaChat = { id: string; isGroup: boolean; timestamp?: number | null };
type OpenWaHistoryMessage = {
  id: string;
  chatId: string;
  from: string;
  to: string;
  body?: string | null;
  type?: string | null;
  timestamp?: number | null;
  fromMe: boolean;
  isGroup?: boolean;
  isStatusBroadcast?: boolean;
  media?: OpenWaMedia;
  contact?: { name?: string | null; pushName?: string | null };
};

class OpenWaHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function openWaRequest<T>(path: string, init: RequestInit = {}) {
  const [configuredBase, apiKey] = await Promise.all([
    runtimeConfig("OPENWA_BASE_URL"),
    runtimeConfig("OPENWA_API_KEY"),
  ]);
  if (!configuredBase || !apiKey)
    throw new OpenWaHttpError(
      503,
      "OpenWA is not configured by the platform owner",
    );
  const base = configuredBase.replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "X-API-Key": apiKey,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const detail = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new OpenWaHttpError(
      response.status,
      detail || `OpenWA request failed (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const statusMap: Record<OpenWaStatus, string> = {
  created: "preparing",
  initializing: "generating_qr",
  qr_ready: "waiting_for_scan",
  authenticating: "authenticating",
  ready: "connected",
  disconnected: "disconnected",
  failed: "error",
};

function remoteName(userId: string, accountId: string) {
  return `pigeon-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}-${accountId.replaceAll("-", "").slice(0, 12)}`.slice(
    0,
    50,
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function persistSession(accountId: string, session: OpenWaSession) {
  const status = statusMap[session.status] ?? "error";
  return prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      providerSessionId: session.id,
      status,
      phoneNumber: session.phone || undefined,
      displayName: session.pushName || undefined,
      lastConnectedAt:
        status === "connected"
          ? new Date(session.connectedAt || Date.now())
          : undefined,
      lastHeartbeat: new Date(),
      lastError: session.lastError || null,
    },
  });
}

async function createRemoteSession(accountId: string) {
  const account = await prisma.whatsAppAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { id: true, ownerId: true },
  });
  const created = await openWaRequest<OpenWaSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      name: remoteName(account.ownerId, account.id),
      config: { autoReconnect: true },
    }),
  });
  await persistSession(accountId, created);
  return created;
}

async function remoteSession(accountId: string) {
  const account = await prisma.whatsAppAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { providerSessionId: true, ownerId: true },
  });
  if (!account.providerSessionId) return createRemoteSession(accountId);
  // Older prototype rows stored a session name here. The official OpenWA API
  // identifies sessions by UUID, so transparently replace legacy identifiers.
  if (!isUuid(account.providerSessionId)) {
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { providerSessionId: null, lastError: null },
    });
    return createRemoteSession(accountId);
  }
  try {
    return await openWaRequest<OpenWaSession>(
      `/sessions/${encodeURIComponent(account.providerSessionId)}`,
    );
  } catch (error) {
    if (!(error instanceof OpenWaHttpError) || error.status !== 404)
      throw error;
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { providerSessionId: null },
    });
    return createRemoteSession(accountId);
  }
}

export async function ensureOpenWaSession(accountId: string) {
  let session = await remoteSession(accountId);
  if (["created", "disconnected", "failed"].includes(session.status)) {
    try {
      session = await openWaRequest<OpenWaSession>(
        `/sessions/${encodeURIComponent(session.id)}/start`,
        { method: "POST" },
      );
    } catch (error) {
      if (!(error instanceof OpenWaHttpError) || error.status !== 400)
        throw error;
    }
  }
  await persistSession(accountId, session);
  return session;
}

export async function waitForOpenWaQr(accountId: string, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const session = await ensureOpenWaSession(accountId);
    if (session.status === "ready") return null;
    try {
      const qr = await openWaRequest<OpenWaQr>(
        `/sessions/${encodeURIComponent(session.id)}/qr`,
      );
      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: {
          status: statusMap[qr.status],
          lastHeartbeat: new Date(),
          lastError: null,
        },
      });
      return qr.qrCode;
    } catch (error) {
      if (
        !(error instanceof OpenWaHttpError) ||
        ![400, 404].includes(error.status)
      )
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

export async function getOpenWaStatus(accountId: string) {
  const session = await remoteSession(accountId);
  return persistSession(accountId, session);
}

export async function syncOpenWaMessages(accountId: string) {
  const account = await prisma.whatsAppAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { providerSessionId: true, ownerId: true },
  });
  if (!account.providerSessionId) return 0;
  const payload = await openWaRequest<{
    messages: OpenWaMessage[];
    total: number;
  }>(
    `/sessions/${encodeURIComponent(account.providerSessionId)}/messages?limit=100&offset=0`,
  );
  // The official live-history endpoint covers the short window where OpenWA's
  // chat list sees a message before its local message row has been persisted.
  const knownConversations = await prisma.whatsAppConversation.findMany({
    where: { accountId },
    select: {
      contactJid: true,
      contactPhone: true,
      lastMessageAt: true,
      messages: {
        where: { type: "image", mediaUrl: null },
        take: 1,
        select: { id: true },
      },
    },
  });
  const byJid = new Map(
    knownConversations
      .filter((item) => item.contactJid)
      .map((item) => [item.contactJid!, item]),
  );
  const byPhone = new Map(
    knownConversations.map((item) => [
      item.contactPhone.replace(/^\+/, ""),
      item,
    ]),
  );
  const chats = await openWaRequest<OpenWaChat[]>(
    `/sessions/${encodeURIComponent(account.providerSessionId)}/chats`,
  ).catch(() => []);
  const liveMessages: OpenWaMessage[] = [];
  const historyCandidates = chats
    .filter((chat) => {
      if (chat.isGroup || chat.id.includes("@g.us")) return false;
      const phoneKey = chat.id.replace(/@(c\.us|s\.whatsapp\.net)$/i, "");
      const known = byJid.get(chat.id) || byPhone.get(phoneKey);
      return (
        Boolean(known?.messages.length) ||
        !known?.lastMessageAt ||
        !chat.timestamp ||
        chat.timestamp * 1000 > known.lastMessageAt.getTime()
      );
    })
    .slice(0, 5);
  const histories = await Promise.all(
    historyCandidates.map(async (chat) => {
      const phoneKey = chat.id.replace(/@(c\.us|s\.whatsapp\.net)$/i, "");
      const known = byJid.get(chat.id) || byPhone.get(phoneKey);
      return {
        chat,
        known,
        messages: await openWaRequest<OpenWaHistoryMessage[]>(
          `/sessions/${encodeURIComponent(account.providerSessionId!)}/messages/${encodeURIComponent(chat.id)}/history?limit=20&includeMedia=true`,
          { signal: AbortSignal.timeout(15_000) },
        ).catch(() => []),
      };
    }),
  );
  for (const { chat, known, messages: history } of histories) {
    for (const message of history) {
      if (message.isGroup || message.isStatusBroadcast) continue;
      if (
        known?.lastMessageAt &&
        message.timestamp &&
        message.timestamp * 1000 <= known.lastMessageAt.getTime() &&
        !(message.type === "image" && message.media?.data)
      )
        continue;
      liveMessages.push({
        id: message.id,
        waMessageId: message.id,
        chatId: message.chatId || chat.id,
        from: message.from,
        to: message.to,
        body: message.body || null,
        type: message.type || "unknown",
        direction: message.fromMe ? "outgoing" : "incoming",
        timestamp: message.timestamp || null,
        status: "sent",
        contact: message.contact,
        media: message.media,
      });
    }
  }
  const deduplicated = new Map<string, OpenWaMessage>();
  for (const message of [...payload.messages, ...liveMessages])
    deduplicated.set(message.waMessageId || message.id, message);
  const orderedMessages = [...deduplicated.values()].sort(
    (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
  );
  const existingRows = await prisma.whatsAppMessage.findMany({
    where: {
      externalId: {
        in: orderedMessages.map((message) => message.waMessageId || message.id),
      },
      conversation: { accountId },
    },
    select: {
      id: true,
      externalId: true,
      mediaUrl: true,
      conversation: {
        select: {
          id: true,
          contactPhone: true,
          contactJid: true,
          contactName: true,
          contactAvatarUrl: true,
          unreadCount: true,
          lastMessageAt: true,
          updatedAt: true,
        },
      },
    },
  });
  const existingByExternalId = new Map(
    existingRows
      .filter((row) => row.externalId)
      .map((row) => [row.externalId!, row]),
  );
  let saved = 0;
  const contactCache = new Map<string, OpenWaContact>();
  for (const message of orderedMessages) {
    const stableMessageId = message.waMessageId || message.id;
    const rawContact =
      message.chatId ||
      (message.direction === "outgoing" ? message.to : message.from);
    if (!rawContact || rawContact.includes("@g.us")) continue;
    const existingMessage = existingByExternalId.get(stableMessageId);
    const remoteMedia = message.media || message.metadata?.media;
    const mediaUrl =
      message.type === "image" &&
      !existingMessage?.mediaUrl &&
      remoteMedia?.data &&
      !remoteMedia.omitted
        ? (
            await saveWhatsAppImage(
              remoteMedia.data,
              remoteMedia.mimetype,
            ).catch(() => null)
          )?.token
        : undefined;
    const contactDataIsStale = existingMessage
      ? Date.now() - existingMessage.conversation.updatedAt.getTime() >
        6 * 60 * 60 * 1000
      : true;
    const needsContactHydration =
      !existingMessage ||
      !existingMessage.conversation.contactJid ||
      existingMessage.conversation.contactPhone.includes("@lid") ||
      (contactDataIsStale &&
        (!existingMessage.conversation.contactName ||
          !existingMessage.conversation.contactAvatarUrl));
    if (existingMessage)
      await prisma.whatsAppMessage.updateMany({
        where: { externalId: stableMessageId, conversation: { accountId } },
        data: {
          status: message.status || "sent",
          ...(mediaUrl && !existingMessage.mediaUrl ? { mediaUrl } : {}),
        },
      });
    if (existingMessage && !needsContactHydration) continue;
    let contact = contactCache.get(rawContact);
    if (!contact) {
      contact = await openWaRequest<OpenWaContact>(
        `/sessions/${encodeURIComponent(account.providerSessionId)}/contacts/${encodeURIComponent(rawContact)}`,
      ).catch(async () => {
        const resolved = rawContact.endsWith("@lid")
          ? await openWaRequest<{ phone: string | null }>(
              `/sessions/${encodeURIComponent(account.providerSessionId!)}/contacts/${encodeURIComponent(rawContact)}/phone`,
            ).catch(() => ({ phone: null }))
          : { phone: rawContact.replace(/@(c\.us|s\.whatsapp\.net)$/i, "") };
        const avatar = await openWaRequest<{ url: string | null }>(
          `/sessions/${encodeURIComponent(account.providerSessionId!)}/contacts/${encodeURIComponent(rawContact)}/profile-picture`,
        ).catch(() => ({ url: null }));
        return {
          id: rawContact,
          number: resolved.phone,
          profilePicUrl: avatar.url,
        };
      });
      if (rawContact.endsWith("@lid")) {
        const resolved = await openWaRequest<{ phone: string | null }>(
          `/sessions/${encodeURIComponent(account.providerSessionId)}/contacts/${encodeURIComponent(rawContact)}/phone`,
        ).catch(() => ({ phone: null }));
        if (resolved.phone) contact = { ...contact, number: resolved.phone };
      }
      if (!contact.profilePicUrl) {
        const avatar = await openWaRequest<{ url: string | null }>(
          `/sessions/${encodeURIComponent(account.providerSessionId)}/contacts/${encodeURIComponent(rawContact)}/profile-picture`,
        ).catch(() => ({ url: null }));
        if (avatar.url) contact = { ...contact, profilePicUrl: avatar.url };
      }
      contactCache.set(rawContact, contact);
    }
    const resolvedValue =
      contact.number || rawContact.replace(/@(c\.us|s\.whatsapp\.net)$/i, "");
    const resolvedPhone = /^\d{7,15}$/.test(resolvedValue)
      ? `+${resolvedValue}`
      : resolvedValue;
    const contactName =
      contact.name ||
      contact.pushName ||
      message.contact?.name ||
      message.contact?.pushName ||
      undefined;
    const contactAvatarUrl = contact.profilePicUrl || undefined;
    if (existingMessage) {
      const current = existingMessage.conversation;
      const target =
        resolvedPhone !== current.contactPhone
          ? await prisma.whatsAppConversation.findUnique({
              where: {
                accountId_contactPhone: {
                  accountId,
                  contactPhone: resolvedPhone,
                },
              },
              select: { id: true, lastMessageAt: true },
            })
          : null;
      if (target && target.id !== current.id) {
        await prisma.$transaction([
          prisma.whatsAppMessage.updateMany({
            where: { conversationId: current.id },
            data: { conversationId: target.id },
          }),
          prisma.whatsAppConversation.update({
            where: { id: target.id },
            data: {
              contactJid: rawContact,
              contactName,
              contactAvatarUrl,
              unreadCount: { increment: current.unreadCount },
              lastMessageAt:
                current.lastMessageAt &&
                (!target.lastMessageAt ||
                  current.lastMessageAt > target.lastMessageAt)
                  ? current.lastMessageAt
                  : target.lastMessageAt,
            },
          }),
          prisma.whatsAppConversation.delete({ where: { id: current.id } }),
        ]);
      } else {
        await prisma.whatsAppConversation.update({
          where: { id: current.id },
          data: {
            contactPhone: resolvedPhone,
            contactJid: rawContact,
            contactName,
            contactAvatarUrl,
          },
        });
      }
      const [legacyContact, canonicalContact] = await Promise.all([
        prisma.contact.findUnique({
          where: {
            userId_phone: {
              userId: account.ownerId,
              phone: current.contactPhone,
            },
          },
          select: { id: true },
        }),
        prisma.contact.findUnique({
          where: {
            userId_phone: { userId: account.ownerId, phone: resolvedPhone },
          },
          select: { id: true },
        }),
      ]);
      if (
        legacyContact &&
        !canonicalContact &&
        current.contactPhone !== resolvedPhone
      ) {
        const legacy = await prisma.contact.findUniqueOrThrow({
          where: { id: legacyContact.id },
          select: { source: true, name: true },
        });
        await prisma.contact.update({
          where: { id: legacyContact.id },
          data: {
            phone: resolvedPhone,
            ...(legacy.source === "manual" && legacy.name
              ? {}
              : { name: contactName }),
            avatarUrl: contactAvatarUrl,
          },
        });
      } else {
        const saved = await prisma.contact.findUnique({
          where: {
            userId_phone: { userId: account.ownerId, phone: resolvedPhone },
          },
          select: { id: true, source: true, name: true },
        });
        if (saved)
          await prisma.contact.update({
            where: { id: saved.id },
            data: {
              ...(saved.source === "manual" && saved.name
                ? {}
                : { name: contactName }),
              avatarUrl: contactAvatarUrl,
            },
          });
      }
      continue;
    }
    await saveWhatsAppMessage({
      accountId,
      contactPhone: resolvedPhone,
      contactJid: rawContact,
      contactName,
      contactAvatarUrl,
      externalId: stableMessageId,
      fromMe: message.direction === "outgoing",
      content: message.body || undefined,
      type: message.type,
      mediaUrl,
      status: message.status,
      sentAt: new Date((message.timestamp || Date.now() / 1000) * 1000),
    });
    saved++;
  }
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { accountId },
    select: {
      id: true,
      contactPhone: true,
      unreadCount: true,
      lastMessageAt: true,
    },
  });
  for (const conversation of conversations) {
    if (!/^\d{7,15}$/.test(conversation.contactPhone)) continue;
    const canonicalPhone = `+${conversation.contactPhone}`;
    const target = await prisma.whatsAppConversation.findUnique({
      where: {
        accountId_contactPhone: { accountId, contactPhone: canonicalPhone },
      },
      select: { id: true, lastMessageAt: true },
    });
    if (!target) {
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { contactPhone: canonicalPhone },
      });
      continue;
    }
    if (target.id === conversation.id) continue;
    await prisma.$transaction([
      prisma.whatsAppMessage.updateMany({
        where: { conversationId: conversation.id },
        data: { conversationId: target.id },
      }),
      prisma.whatsAppConversation.update({
        where: { id: target.id },
        data: {
          unreadCount: { increment: conversation.unreadCount },
          lastMessageAt:
            conversation.lastMessageAt &&
            (!target.lastMessageAt ||
              conversation.lastMessageAt > target.lastMessageAt)
              ? conversation.lastMessageAt
              : target.lastMessageAt,
        },
      }),
      prisma.whatsAppConversation.delete({ where: { id: conversation.id } }),
    ]);
  }
  return saved;
}

const activeSyncs = new Map<string, Promise<number>>();

export function queueOpenWaSync(accountId: string) {
  const active = activeSyncs.get(accountId);
  if (active) return active;
  const job = syncOpenWaMessages(accountId).finally(() => {
    if (activeSyncs.get(accountId) === job) activeSyncs.delete(accountId);
  });
  activeSyncs.set(accountId, job);
  return job;
}

export async function ingestOpenWaEvent(
  providerSessionId: string,
  event: string,
  data: unknown,
) {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { providerSessionId },
    select: { id: true },
  });
  if (!account || !data || typeof data !== "object") return false;
  const payload = data as OpenWaLiveMessage;
  if (event === "message.ack") {
    const externalId = payload.messageId || payload.id;
    if (!externalId || !payload.status) return false;
    await prisma.whatsAppMessage.updateMany({
      where: { externalId, conversation: { accountId: account.id } },
      data: { status: payload.status },
    });
    return true;
  }
  if (
    !event.startsWith("message.") ||
    payload.isGroup ||
    payload.isStatusBroadcast
  )
    return false;
  const fromMe = event === "message.sent" || Boolean(payload.fromMe);
  const rawContact = payload.chatId || (fromMe ? payload.to : payload.from);
  if (!rawContact || rawContact.includes("@g.us")) return false;
  const resolved =
    payload.senderPhone ||
    payload.contact?.number ||
    rawContact.replace(/@(c\.us|s\.whatsapp\.net)$/i, "");
  const contactPhone = /^\d{7,15}$/.test(resolved) ? `+${resolved}` : resolved;
  let mediaUrl: string | undefined;
  if (
    payload.type === "image" &&
    payload.media?.data &&
    !payload.media.omitted
  ) {
    mediaUrl = (
      await saveWhatsAppImage(payload.media.data, payload.media.mimetype).catch(
        () => null,
      )
    )?.token;
  }
  await saveWhatsAppMessage({
    accountId: account.id,
    contactPhone,
    contactJid: rawContact,
    contactName:
      payload.contact?.pushName ||
      payload.contact?.name ||
      payload.contact?.shortName ||
      undefined,
    externalId: payload.messageId || payload.id,
    fromMe,
    content: payload.body || undefined,
    type: payload.type || "text",
    mediaUrl,
    status: payload.status || "sent",
    sentAt: new Date((payload.timestamp || Date.now() / 1000) * 1000),
  });
  return true;
}

export async function sendOpenWaImage(
  accountId: string,
  phone: string,
  image: {
    base64: string;
    mimetype: string;
    filename: string;
    caption?: string;
  },
) {
  const session = await ensureOpenWaSession(accountId);
  if (session.status !== "ready")
    throw new Error("WhatsApp account is not connected");
  return openWaRequest<{ messageId: string; timestamp: number }>(
    `/sessions/${encodeURIComponent(session.id)}/messages/send-image`,
    {
      method: "POST",
      body: JSON.stringify({
        chatId: `${phone.replace(/^\+/, "")}@c.us`,
        base64: image.base64,
        mimetype: image.mimetype,
        filename: image.filename,
        caption: image.caption || undefined,
      }),
    },
  );
}

export async function getOpenWaConversationAvatar(
  conversationId: string,
  ownerId: string,
  force = false,
) {
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, account: { ownerId } },
    select: {
      id: true,
      contactJid: true,
      contactAvatarUrl: true,
      account: { select: { providerSessionId: true } },
    },
  });
  if (!conversation) return null;
  if (conversation.contactAvatarUrl && !force)
    return conversation.contactAvatarUrl;
  if (!conversation.contactJid || !conversation.account.providerSessionId)
    return null;
  const avatar = await openWaRequest<{ url: string | null }>(
    `/sessions/${encodeURIComponent(conversation.account.providerSessionId)}/contacts/${encodeURIComponent(conversation.contactJid)}/profile-picture`,
  ).catch(() => ({ url: null }));
  if (!avatar.url) return null;
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { contactAvatarUrl: avatar.url },
  });
  return avatar.url;
}

export async function sendOpenWaText(
  accountId: string,
  phone: string,
  content: string,
) {
  const session = await ensureOpenWaSession(accountId);
  if (session.status !== "ready")
    throw new Error("WhatsApp account is not connected");
  return openWaRequest<{ messageId: string; timestamp: number }>(
    `/sessions/${encodeURIComponent(session.id)}/messages/send-text`,
    {
      method: "POST",
      body: JSON.stringify({
        chatId: `${phone.replace(/^\+/, "")}@c.us`,
        text: content,
      }),
    },
  );
}

export async function stopOpenWaSession(accountId: string) {
  const session = await remoteSession(accountId);
  const stopped = await openWaRequest<OpenWaSession>(
    `/sessions/${encodeURIComponent(session.id)}/stop`,
    { method: "POST" },
  );
  return persistSession(accountId, stopped);
}

export async function logoutOpenWaSession(accountId: string) {
  const account = await prisma.whatsAppAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { providerSessionId: true },
  });
  if (account.providerSessionId) {
    try {
      await openWaRequest<void>(
        `/sessions/${encodeURIComponent(account.providerSessionId)}`,
        { method: "DELETE" },
      );
    } catch (error) {
      if (!(error instanceof OpenWaHttpError) || error.status !== 404)
        throw error;
    }
  }
  return prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      providerSessionId: null,
      phoneNumber: null,
      displayName: null,
      avatarUrl: null,
      status: "logged_out",
      lastHeartbeat: new Date(),
    },
  });
}

export async function deleteOpenWaSession(accountId: string) {
  const account = await prisma.whatsAppAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { providerSessionId: true },
  });
  if (!account.providerSessionId) return;
  try {
    await openWaRequest<void>(
      `/sessions/${encodeURIComponent(account.providerSessionId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (!(error instanceof OpenWaHttpError) || error.status !== 404)
      throw error;
  }
}

export async function restoreOpenWaSessions() {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { status: { not: "logged_out" } },
    select: { id: true },
  });
  for (const account of accounts)
    void ensureOpenWaSession(account.id).catch(async (error) => {
      await prisma.whatsAppAccount
        .update({
          where: { id: account.id },
          data: {
            status: "error",
            lastError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "OpenWA restore failed",
          },
        })
        .catch(() => undefined);
    });
}

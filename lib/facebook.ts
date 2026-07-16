import axios from "axios";
import { prisma } from "./prisma";
import { decrypt, encrypt } from "./encryption";
import { notifyUser } from "./notifications";
import { runtimeConfig } from "./runtime-config";
const GRAPH_ORIGIN = "https://graph.facebook.com";
async function graphBaseUrl() {
  const raw = (await runtimeConfig("FACEBOOK_GRAPH_VERSION")).trim();
  const version = /^v\d+\.\d+$/.test(raw) ? raw : "v23.0";
  return `${GRAPH_ORIGIN}/${version}`;
}
async function syncOptions() {
  const size = Number(await runtimeConfig("FACEBOOK_SYNC_PAGE_SIZE"));
  const pages = Number(await runtimeConfig("FACEBOOK_SYNC_MAX_PAGES"));
  return {
    pageSize: Number.isInteger(size) ? Math.min(100, Math.max(1, size)) : 100,
    maxPages: Number.isInteger(pages) ? Math.min(200, Math.max(1, pages)) : 50,
  };
}
export async function facebookRequest<T>(
  pageDbId: string,
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  data?: unknown,
) {
  const page = await prisma.facebookPage.findUniqueOrThrow({
    where: { id: pageDbId },
  });
  const token = decrypt(page.accessTokenEnc);
  const response = await axios.request<T>({
    baseURL: await graphBaseUrl(),
    url: path,
    method,
    data: method === "GET" ? undefined : data,
    params: { ...(method === "GET" && data && typeof data === "object" ? data : {}), access_token: token },
    timeout: 15000,
  });
  return response.data;
}
export async function facebookImageRequest(pageDbId: string, recipientId: string, image: File) {
  const page = await prisma.facebookPage.findUniqueOrThrow({ where: { id: pageDbId } });
  const token = decrypt(page.accessTokenEnc);
  const form = new FormData();
  form.set("recipient", JSON.stringify({ id: recipientId }));
  form.set("message", JSON.stringify({ attachment: { type: "image", payload: { is_reusable: false } } }));
  form.set("filedata", image, image.name);
  const response = await axios.post<{ message_id?: string; attachment_id?: string }>(`${await graphBaseUrl()}/me/messages`, form, {
    params: { access_token: token }, timeout: 30000,
  });
  return response.data;
}
async function facebookNext<T>(next: string, token: string) {
  const url = new URL(next);
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com")
    throw new Error("Facebook returned an invalid pagination URL");
  url.searchParams.set("access_token", token);
  const response = await axios.get<T>(url.toString(), { timeout: 15000 });
  return response.data;
}
export async function saveFacebookMessage(input: {
  pageId: string;
  conversationExternalId: string;
  messageExternalId?: string;
  participantName?: string;
  participantId?: string;
  participantAvatarUrl?: string;
  content: string;
  fromPage: boolean;
  sentAt: Date;
  attachments?: object;
  notify?: boolean;
  markUnread?: boolean;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const page = await tx.facebookPage.findUniqueOrThrow({
      where: { id: input.pageId },
      select: { ownerId: true, name: true },
    });
    const existingMessage = input.messageExternalId
      ? await tx.facebookMessage.findFirst({ where: { externalId: input.messageExternalId, conversation: { pageId: input.pageId } } })
      : null;
    if (existingMessage) return { message: existingMessage, conversationId: existingMessage.conversationId, ownerId: page.ownerId, pageName: page.name, duplicate: true };
    const unreadIncrement = input.fromPage || input.markUnread === false ? 0 : 1;
    const conversation = await tx.facebookConversation.upsert({
      where: {
        pageId_externalId: {
          pageId: input.pageId,
          externalId: input.conversationExternalId,
        },
      },
      update: {
        lastMessageAt: input.sentAt,
        hiddenAt: null,
        participantName: input.participantName,
        participantId: input.participantId,
        participantAvatarUrl: input.participantAvatarUrl,
        unreadCount: { increment: unreadIncrement },
      },
      create: {
        pageId: input.pageId,
        externalId: input.conversationExternalId,
        participantName: input.participantName,
        participantId: input.participantId,
        participantAvatarUrl: input.participantAvatarUrl,
        lastMessageAt: input.sentAt,
        unreadCount: unreadIncrement,
      },
    });
    const message = await tx.facebookMessage.create({
      data: {
        conversationId: conversation.id,
        externalId: input.messageExternalId,
        contentEnc: encrypt(input.content),
        fromPage: input.fromPage,
        sentAt: input.sentAt,
        attachments: input.attachments,
      },
    });
    return {
      message,
      conversationId: conversation.id,
      ownerId: page.ownerId,
      pageName: page.name,
      duplicate: false,
    };
  });
  if (!input.fromPage && input.notify !== false && !result.duplicate)
    await notifyUser({
      userId: result.ownerId,
      type: "messenger_message",
      title: `New Messenger message from ${input.participantName || "Facebook contact"}`,
      body: input.content.slice(0, 180),
      metadata: {
        href: `/messenger?conversation=${result.conversationId}`,
        conversationId: result.conversationId,
        pageId: input.pageId,
        pageName: result.pageName,
      },
    });
  return result.message;
}
export async function saveFacebookComment(input: {
  pageId: string;
  externalId: string;
  postId?: string;
  authorName?: string;
  authorId?: string;
  authorAvatarUrl?: string;
  content: string;
  postedAt: Date;
}) {
  return prisma.facebookComment.upsert({
    where: { externalId: input.externalId },
    update: {
      contentEnc: encrypt(input.content),
      authorName: input.authorName,
      authorId: input.authorId,
      authorAvatarUrl: input.authorAvatarUrl,
    },
    create: {
      pageId: input.pageId,
      externalId: input.externalId,
      postId: input.postId,
      authorName: input.authorName,
      authorId: input.authorId,
      authorAvatarUrl: input.authorAvatarUrl,
      contentEnc: encrypt(input.content),
      postedAt: input.postedAt,
    },
  });
}

export async function resolveFacebookCommentAuthor(
  pageDbId: string,
  authorId?: string | null,
) {
  if (!authorId) return null;
  return facebookRequest<{
    id?: string;
    name?: string;
    picture?: { data?: { url?: string } };
  }>(pageDbId, `/${encodeURIComponent(authorId)}`, "GET", {
    fields: "id,name,picture.type(square)",
  }).then((profile) => ({
    name: profile.name,
    avatarUrl: profile.picture?.data?.url,
  })).catch(() => null);
}
export const decryptFacebookMessage = <T extends { contentEnc: string }>(
  m: T,
) => {
  const { contentEnc, ...rest } = m;
  return { ...rest, content: decrypt(contentEnc) };
};

type GraphComment = {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string; picture?: { data?: { url?: string } } };
  reactions?: { summary?: { total_count?: number } };
};
type GraphPost = {
  id: string;
  message?: string;
  created_time?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { data?: GraphComment[]; summary?: { total_count?: number } };
};

export async function syncFacebookPostComments(pageDbId: string, postExternalId: string) {
  const page = await prisma.facebookPage.findUniqueOrThrow({ where: { id: pageDbId } });
  const token = decrypt(page.accessTokenEnc), options = await syncOptions();
  let result = await facebookRequest<{ data: GraphComment[]; paging?: { next?: string } }>(
    pageDbId,
    `/${encodeURIComponent(postExternalId)}/comments`,
    "GET",
    {
      fields: "id,message,created_time,from,reactions.limit(0).summary(true)",
      limit: options.pageSize,
    },
  );
  let pageNumber = 0, synced = 0;
  while (result && pageNumber++ < options.maxPages) {
    for (const comment of result.data ?? []) {
      const saved = await saveFacebookComment({
        pageId: page.id,
        externalId: comment.id,
        postId: postExternalId,
        authorName: comment.from?.name,
        authorId: comment.from?.id,
        authorAvatarUrl: comment.from?.picture?.data?.url,
        content: comment.message || "",
        postedAt: new Date(comment.created_time || Date.now()),
      });
      await prisma.facebookComment.update({
        where: { id: saved.id },
        data: { reactions: comment.reactions?.summary?.total_count ?? 0 },
      });
      synced++;
    }
    result = result.paging?.next
      ? await facebookNext<typeof result>(result.paging.next, token)
      : null as never;
  }
  return synced;
}

export async function syncFacebookPage(pageDbId: string) {
  const page = await prisma.facebookPage.findUniqueOrThrow({
    where: { id: pageDbId },
  });
  const token = decrypt(page.accessTokenEnc), options = await syncOptions();
  let feed = await facebookRequest<{ data: GraphPost[]; paging?: { next?: string } }>(pageDbId, "/me/posts", "GET", {
    fields: "id,message,created_time,shares,reactions.limit(0).summary(true),comments.limit(100){id,message,created_time,from,reactions.limit(0).summary(true)}",
    limit: options.pageSize,
  }), pageNumber = 0, synced = 0;
  while (feed && pageNumber++ < options.maxPages) {
  for (const item of feed.data ?? []) {
    const existing = await prisma.facebookPost.findFirst({
      where: { pageId: page.id, externalId: item.id },
      select: { id: true },
    });
    const values = {
      content: item.message || "[Media post]",
      status: "published",
      publishedAt: new Date(item.created_time || Date.now()),
      reactions: item.reactions?.summary?.total_count ?? 0,
      commentsCount:
        item.comments?.summary?.total_count ?? item.comments?.data?.length ?? 0,
      shares: item.shares?.count ?? 0,
    };
    if (existing)
      await prisma.facebookPost.update({
        where: { id: existing.id },
        data: values,
      });
    else
      await prisma.facebookPost.create({
        data: {
          pageId: page.id,
          externalId: item.id,
          mediaUrls: [],
          ...values,
        },
      });
    for (const comment of item.comments?.data ?? []) {
      const saved = await saveFacebookComment({
        pageId: page.id,
        externalId: comment.id,
        postId: item.id,
        authorName: comment.from?.name,
        authorId: comment.from?.id,
        authorAvatarUrl: comment.from?.picture?.data?.url,
        content: comment.message || "",
        postedAt: new Date(comment.created_time || Date.now()),
      });
      await prisma.facebookComment.update({
        where: { id: saved.id },
        data: { reactions: comment.reactions?.summary?.total_count ?? 0 },
      });
    }
    synced++;
  }
  feed = feed.paging?.next ? await facebookNext<typeof feed>(feed.paging.next, token) : null as never;
  }
  await prisma.facebookPage.update({
    where: { id: page.id },
    data: { lastSyncedAt: new Date() },
  });
  return synced;
}

type GraphConversation = { id: string; updated_time?: string; participants?: { data?: { id: string; name?: string }[] } };
type GraphMessage = { id: string; message?: string; created_time?: string; from?: { id?: string; name?: string }; attachments?: { data?: object[] } };
export async function syncFacebookConversations(pageDbId: string) {
  const page = await prisma.facebookPage.findUniqueOrThrow({ where: { id: pageDbId } });
  const token = decrypt(page.accessTokenEnc), options = await syncOptions();
  let result = await facebookRequest<{ data: GraphConversation[]; paging?: { next?: string } }>(pageDbId, "/me/conversations", "GET", { fields: "id,updated_time,participants", limit: options.pageSize });
  let conversationPages = 0, conversations = 0, messages = 0;
  while (result && conversationPages++ < options.maxPages) {
    for (const item of result.data ?? []) {
      const participant = item.participants?.data?.find((person) => person.id !== page.pageId);
      const avatar = participant?.id
        ? await facebookRequest<{ data?: { url?: string } }>(pageDbId, `/${encodeURIComponent(participant.id)}/picture`, "GET", { redirect: false }).catch(() => null)
        : null;
      let messagePage = await facebookRequest<{ data: GraphMessage[]; paging?: { next?: string } }>(pageDbId, `/${encodeURIComponent(item.id)}/messages`, "GET", { fields: "id,message,created_time,from,attachments", limit: options.pageSize });
      const collected: GraphMessage[] = [];
      let messagePages = 0;
      while (messagePage && messagePages++ < options.maxPages) {
        collected.push(...(messagePage.data ?? []));
        messagePage = messagePage.paging?.next ? await facebookNext<typeof messagePage>(messagePage.paging.next, token) : null as never;
      }
      for (const message of collected.sort((a, b) => new Date(a.created_time || 0).getTime() - new Date(b.created_time || 0).getTime())) {
        await saveFacebookMessage({
          pageId: page.id,
          conversationExternalId: participant?.id || item.id,
          messageExternalId: message.id,
          participantId: participant?.id,
          participantName: participant?.name,
          participantAvatarUrl: avatar?.data?.url,
          content: message.message || "[attachment]",
          fromPage: message.from?.id === page.pageId,
          sentAt: new Date(message.created_time || item.updated_time || Date.now()),
          attachments: message.attachments,
          notify: false,
          markUnread: false,
        });
        messages++;
      }
      conversations++;
    }
    result = result.paging?.next ? await facebookNext<typeof result>(result.paging.next, token) : null as never;
  }
  return { conversations, messages };
}

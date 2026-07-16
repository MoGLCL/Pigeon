"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Eraser, ImagePlus, Send, X } from "lucide-react";
import { FaFacebookMessenger } from "react-icons/fa";
import { Panel } from "@/components/ui/Panel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Summary = {
  id: string;
  participantName?: string;
  participantId?: string;
  participantAvatarUrl?: string;
  externalId: string;
  unreadCount: number;
  lastMessageAt?: string;
  page: { id: string; name: string; avatarUrl?: string };
  messages: {
    id: string;
    content: string;
    sentAt: string;
    fromPage: boolean;
    attachments?: unknown;
  }[];
};
type Detail = Summary & {
  messages: {
    id: string;
    content: string;
    sentAt: string;
    fromPage: boolean;
    attachments?: unknown;
  }[];
};

function Avatar({ item }: { item: Summary }) {
  return item.participantAvatarUrl ? (
    <img
      className="conversation-avatar"
      src={item.participantAvatarUrl}
      alt=""
    />
  ) : (
    <span className="avatar">
      {(item.participantName || "FB").slice(0, 2).toUpperCase()}
    </span>
  );
}

export function MessengerWorkspace() {
  const [items, setItems] = useState<Summary[]>([]),
    [active, setActive] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmClear, setConfirmClear] = useState(false);
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const latestLocalMutation = useRef(0);
  const load = useCallback(async () => {
    const response = await fetch("/api/facebook/conversations", {
      cache: "no-store",
    });
    if (response.ok) setItems(await response.json());
  }, []);
  const open = useCallback(async (id: string) => {
    const startedAt = Date.now();
    const response = await fetch(
      `/api/facebook/conversations?id=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const next = await response.json();
      if (startedAt < latestLocalMutation.current) return;
      setActive(next);
      window.history.replaceState(
        null,
        "",
        `/messenger?conversation=${encodeURIComponent(id)}`,
      );
    }
  }, []);
  useEffect(() => {
    void load();
    const requested = new URLSearchParams(window.location.search).get(
      "conversation",
    );
    if (requested) void open(requested);
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [load, open]);
  useEffect(() => {
    if (active) void open(active.id);
  }, [items, active?.id, open]);
  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [active?.messages.length]);
  async function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active?.participantId || submittingRef.current) return;
    const form = event.currentTarget,
      message = String(new FormData(form).get("message") || "").trim();
    if (!message && !replyImage) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    try {
      let response: Response;
      if (replyImage) {
        const body = new FormData();
        body.set("pageId", active.page.id); body.set("conversationExternalId", active.externalId); body.set("recipientId", active.participantId); body.set("message", message); body.set("image", replyImage);
        response = await fetch("/api/facebook/messages/image", { method: "POST", body });
      } else response = await fetch("/api/facebook/messages", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId: active.page.id, conversationExternalId: active.externalId, recipientId: active.participantId, message }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Reply could not be sent");
      latestLocalMutation.current = Date.now();
      if (body.message)
        setActive((current) => current ? { ...current, lastMessageAt: body.message.sentAt, messages: [...current.messages.filter((item) => item.id !== body.message.id), body.message] } : current);
      form.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
      setReplyImage(null);
      await load();
      window.setTimeout(() => void open(active.id), 250);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reply could not be sent");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }
  async function clearRecent() {
    if (!items.length) return;
    setBusy(true);
    const response = await fetch("/api/facebook/conversations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(
        (await response.json()).error ?? "Recent chats could not be cleared",
      );
      return;
    }
    setItems([]);
    setActive(null);
    setConfirmClear(false);
    window.history.replaceState(null, "", "/messenger");
  }
  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Messenger</h1>
          <p>
            Open real Page conversations and reply from the correct connected
            account.
          </p>
        </div>
        <span className="messenger-brand" aria-label="Messenger">
          <FaFacebookMessenger />
        </span>
      </header>
      <div className="messenger-layout">
        <Panel className="messenger-inbox">
          <div className="panel-header">
            <div>
              <h2>Recent chats</h2>
              <p>
                {items.length} conversation{items.length === 1 ? "" : "s"}{" "}
                across your Pages
              </p>
            </div>
            <button
              className="clear-recent-button"
              onClick={() => setConfirmClear(true)}
              disabled={!items.length}
            >
              <Eraser size={15} />
              Clear recent
            </button>
          </div>
          <div className="messenger-thread-list">
            {items.length ? (
              items.map((item) => (
                <button
                  className={active?.id === item.id ? "is-active" : ""}
                  key={item.id}
                  onClick={() => void open(item.id)}
                >
                  <Avatar item={item} />
                  <div>
                    <strong>
                      {item.participantName || "Facebook contact"}
                    </strong>
                    <p>{item.messages[0]?.content || "No message preview"}</p>
                    <small>
                      via {item.page.name}
                      {item.lastMessageAt
                        ? ` · ${formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: true })}`
                        : ""}
                    </small>
                  </div>
                  {item.unreadCount ? (
                    <b className="unread">{item.unreadCount}</b>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="channel-empty">
                <FaFacebookMessenger className="empty-channel-icon" />
                <p>No Messenger conversations yet.</p>
              </div>
            )}
          </div>
        </Panel>
        <Panel className="messenger-conversation">
          {active ? (
            <>
              <div className="conversation-heading">
                <div className="conversation-person">
                  <Avatar item={active} />
                  <span>
                    <strong>
                      {active.participantName || "Facebook contact"}
                    </strong>
                    <small>{active.lastMessageAt ? `Last active ${formatDistanceToNow(new Date(active.lastMessageAt), { addSuffix: true })} · ` : ""}via {active.page.name}</small>
                  </span>
                </div>
                <span className="messenger-brand small" aria-hidden="true">
                  <FaFacebookMessenger />
                </span>
              </div>
              <div className="message-stream" ref={streamRef}>
                {active.messages.map((message) => (
                  <article
                    className={message.fromPage ? "is-outgoing" : "is-incoming"}
                    key={message.id}
                  >
                    {messageImage(message) ? <img className="chat-message-image" src={messageImage(message)} alt="Shared image"/> : hasImageAttachment(message.attachments) ? <div className="chat-attachment-placeholder"><ImagePlus size={18}/>Image attachment</div> : null}
                    {message.content && message.content !== "[Image]" && message.content !== "[attachment]" ? <p>{message.content}</p> : null}
                    <time>
                      {formatDistanceToNow(new Date(message.sentAt), {
                        addSuffix: true,
                      })}
                    </time>
                  </article>
                ))}
              </div>
              <form className="message-reply" onSubmit={reply}>
                <div className="chat-composer-field">{replyImage ? <div className="chat-image-selection"><ImagePlus size={16}/><span>{busy ? `Sending ${replyImage.name}…` : replyImage.name}</span><button type="button" disabled={busy} onClick={() => { setReplyImage(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} aria-label="Remove selected image"><X size={14}/></button></div> : null}<textarea name="message" placeholder={`Reply as ${active.page.name}`} maxLength={2000}/></div>
                <label className="chat-attach-button" title="Send image"><ImagePlus size={19}/><input ref={fileInputRef} type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setReplyImage(event.target.files?.[0] || null)}/><span className="sr-only">Choose image</span></label>
                <button
                  className="primary-button"
                  disabled={busy || !active.participantId}
                >
                  <Send size={16} />
                  {busy ? "Sending…" : "Send"}
                </button>
              </form>
              {error ? <p className="form-error">{error}</p> : null}
            </>
          ) : (
            <div className="channel-empty">
              <FaFacebookMessenger className="empty-channel-icon" />
              <h2>Select a conversation</h2>
              <p>Choose a thread to read and reply from the connected Page.</p>
            </div>
          )}
        </Panel>
      </div>
      <ConfirmDialog
        open={confirmClear}
        title="Clear recent Messenger chats?"
        description="This hides the current recent list. Imported history stays safe and any new message will make its conversation appear again."
        confirmLabel="Clear recent"
        tone="neutral"
        busy={busy}
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearRecent}
      />
    </>
  );
}

function attachmentData(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  return Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}
function attachmentImage(value: unknown) {
  for (const item of attachmentData(value)) {
    const payload = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : null;
    const url = typeof item.image_data === "object" && item.image_data ? (item.image_data as Record<string, unknown>).url : payload?.url;
    if (typeof url === "string" && /^https:\/\//.test(url)) return url;
  }
  return undefined;
}
function hasLocalImage(value: unknown) {
  return attachmentData(value).some((item) => typeof item.localToken === "string" && item.localToken.startsWith("local:"));
}
function messageImage(message: { id: string; attachments?: unknown }) {
  return attachmentImage(message.attachments) || (hasLocalImage(message.attachments) ? `/api/facebook/media/${message.id}` : undefined);
}
function hasImageAttachment(value: unknown) {
  return attachmentData(value).some((item) => item.type === "image" || "image_data" in item);
}

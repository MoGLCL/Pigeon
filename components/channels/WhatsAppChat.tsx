"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  ChevronLeft,
  Clock3,
  ImagePlus,
  Send,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Panel } from "@/components/ui/Panel";

type Message = {
  id: string;
  content?: string | null;
  type: string;
  fromMe: boolean;
  sentAt: string;
  status: string;
  mediaUrl?: string | null;
  previewUrl?: string;
};
type Conversation = {
  id: string;
  contactName?: string;
  contactPhone: string;
  lastMessageAt?: string;
  account: { id: string; sessionName: string };
  messages: Message[];
};

export function WhatsAppChat({ id }: { id: string }) {
  const [chat, setChat] = useState<Conversation | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [image, setImage] = useState<File | null>(null);
  const stream = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const latestLocalMutation = useRef(0);
  const load = useCallback(async () => {
    if (submitting.current) return;
    const startedAt = Date.now();
    const response = await fetch(
      `/api/whatsapp/conversations?id=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!response.ok)
      return setError(
        (await response.json()).error || "Conversation could not be loaded",
      );
    const next = await response.json();
    if (startedAt < latestLocalMutation.current) return;
    setChat(next);
    setError("");
  }, [id]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    stream.current?.scrollTo({
      top: stream.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat?.messages.length]);

  async function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chat || submitting.current) return;
    const form = event.currentTarget,
      message = String(new FormData(form).get("message") || "").trim();
    if (!message && !image)
      return setError("Write a message or choose an image.");
    const phone = chat.contactPhone.startsWith("+")
      ? chat.contactPhone
      : `+${chat.contactPhone}`;
    if (!/^\+\d{7,15}$/.test(phone))
      return setError(
        "This contact phone number is still being resolved by WhatsApp.",
      );
    submitting.current = true;
    setBusy(true);
    setError("");
    const selectedImage = image;
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const previewUrl = selectedImage ? URL.createObjectURL(selectedImage) : "";
    latestLocalMutation.current = Date.now();
    setChat((current) => current ? {
      ...current,
      lastMessageAt: new Date().toISOString(),
      messages: [...current.messages, {
        id: optimisticId,
        content: message || null,
        type: selectedImage ? "image" : "text",
        fromMe: true,
        sentAt: new Date().toISOString(),
        status: "pending",
        mediaUrl: selectedImage ? "preview" : null,
        previewUrl,
      }],
    } : current);
    form.reset();
    if (fileInput.current) fileInput.current.value = "";
    setImage(null);
    try {
      let response: Response;
      if (selectedImage) {
        const body = new FormData();
        body.set("accountId", chat.account.id);
        body.set("phone", phone);
        body.set("caption", message);
        body.set("image", selectedImage);
        response = await fetch("/api/whatsapp/send-image", { method: "POST", body });
      } else {
        response = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountId: chat.account.id, phones: [phone], message }),
        });
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Reply failed");
      latestLocalMutation.current = Date.now();
      if (body.message) {
        setChat((current) => current ? {
          ...current,
          lastMessageAt: body.message.sentAt,
          messages: current.messages.some((item) => item.id === body.message.id)
            ? current.messages.filter((item) => item.id !== optimisticId)
            : current.messages.map((item) => item.id === optimisticId ? body.message : item),
        } : current);
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      window.setTimeout(() => void load(), 250);
    } catch (reason) {
      if (optimisticId) {
        setChat((current) => current ? {
          ...current,
          messages: current.messages.filter((item) => item.id !== optimisticId),
        } : current);
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setError(reason instanceof Error ? reason.message : "Reply failed");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const displayName = chat?.contactName || chat?.contactPhone || "Conversation";
  return (
    <>
      <header className="workspace-header chat-page-header">
        <div>
          <Link className="back-link-inline" href="/whatsapp">
            <ChevronLeft size={17} />
            WhatsApp
          </Link>
          <h1>WhatsApp conversation</h1>
          <p>Reply in real time from your connected account.</p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <Panel className="channel-conversation dedicated-chat whatsapp-chat">
        {chat ? (
          <>
            <div className="chat-contact-bar">
              <ChatAvatar id={chat.id} label={displayName} />
              <div>
                <strong>{displayName}</strong>
                <span>
                  {chat.lastMessageAt
                    ? `Last seen ${formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true })}`
                    : "Last seen unavailable"}{" "}
                  · {chat.account.sessionName}
                </span>
              </div>
              <span className="chat-live-status">Connected</span>
            </div>
            <div className="message-stream" ref={stream}>
              {chat.messages.length ? (
                chat.messages.map((message) => (
                  <article
                    className={message.fromMe ? "is-outgoing" : "is-incoming"}
                    key={message.id}
                  >
                    {message.type === "image" && message.mediaUrl ? (
                      <img
                        className="chat-message-image"
                        src={message.previewUrl || `/api/whatsapp/media/${message.id}`}
                        alt={message.content || "Shared image"}
                      />
                    ) : message.type === "image" ? (
                      <div className="chat-media-unavailable">
                        <ImagePlus size={18} />
                        <span>Image is no longer available</span>
                      </div>
                    ) : null}
                    {message.content ? (
                      <p>{message.content}</p>
                    ) : message.type !== "image" ? (
                      <p>[{message.type}]</p>
                    ) : null}
                    <time>
                      {new Date(message.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {message.fromMe ? (
                        <MessageStatus status={message.status} />
                      ) : null}
                    </time>
                  </article>
                ))
              ) : (
                <div className="empty-state">No messages in this chat yet.</div>
              )}
            </div>
            <form className="message-reply" onSubmit={reply}>
              <div className="chat-composer-field">
                {image ? (
                  <div className="chat-image-selection">
                    <ImagePlus size={16} />
                    <span>{busy ? `Sending ${image.name}…` : image.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setImage(null); if (fileInput.current) fileInput.current.value = ""; }}
                      aria-label="Remove selected image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                <textarea
                  name="message"
                  placeholder={
                    image ? "Add a caption…" : `Message ${displayName}`
                  }
                  maxLength={4096}
                />
              </div>
              <label className="chat-attach-button" title="Send an image">
                <ImagePlus size={19} />
                <input
                  ref={fileInput}
                  type="file"
                  disabled={busy}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(event) =>
                    setImage(event.target.files?.[0] || null)
                  }
                />
                <span className="sr-only">Choose image</span>
              </label>
              <button className="primary-button" disabled={busy}>
                <Send size={16} />
                {busy ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        ) : (
          <div className="empty-state">Loading messages…</div>
        )}
      </Panel>
    </>
  );
}

function ChatAvatar({ id, label }: { id: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="chat-contact-avatar" aria-hidden="true">
      {label.slice(0, 1).toUpperCase()}
    </span>
  ) : (
    <img
      src={`/api/whatsapp/avatar/${id}`}
      alt={`${label} profile`}
      onError={() => setFailed(true)}
    />
  );
}
function MessageStatus({ status }: { status: string }) {
  const value = status.toLowerCase();
  if (["pending", "queued", "created"].includes(value))
    return <Clock3 className="message-status" size={13} aria-label="Pending" />;
  if (value === "read")
    return (
      <CheckCheck
        className="message-status is-read"
        size={14}
        aria-label="Read"
      />
    );
  if (["delivered", "received"].includes(value))
    return (
      <CheckCheck
        className="message-status is-delivered"
        size={14}
        aria-label="Delivered"
      />
    );
  return <Check className="message-status" size={14} aria-label="Sent" />;
}

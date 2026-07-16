"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ContactRound,
  Check,
  CheckCheck,
  Clock3,
  ImagePlus,
  Eraser,
  LogOut,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { Panel } from "@/components/ui/Panel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isInternationalPhone, splitInternationalPhones } from "@/lib/phone";

type Account = {
  id: string;
  sessionName: string;
  phoneNumber?: string;
  displayName?: string;
  avatarUrl?: string;
  status: string;
  lastConnectedAt?: string;
  lastError?: string;
};
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
  contactAvatarUrl?: string;
  unreadCount: number;
  lastMessageAt?: string;
  account: { id: string; sessionName: string; phoneNumber?: string };
  messages: Message[];
};
type ModalMode = "create" | "qr" | null;

const qrStates = new Set([
  "preparing",
  "generating_qr",
  "waiting_for_scan",
  "logged_out",
  "error",
]);

function Avatar({ id, label }: { id: string; label: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  return failed ? (
    <span className="avatar">{label.slice(0, 2).toUpperCase()}</span>
  ) : (
    <img
      className="conversation-avatar"
      src={`/api/whatsapp/avatar/${id}`}
      alt={`${label} profile`}
      onError={() => setFailed(true)}
    />
  );
}

export function WhatsAppWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [chats, setChats] = useState<Conversation[]>([]),
    [active, setActive] = useState<Conversation | null>(null),
    [modal, setModal] = useState<ModalMode>(null);
  const [connectionName, setConnectionName] = useState(""),
    [qrCode, setQrCode] = useState<string | null>(null),
    [qrAccount, setQrAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [phonesText, setPhonesText] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [confirmState, setConfirmState] = useState<
    { kind: "delete"; account: Account } | { kind: "clear" } | null
  >(null);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(
    null,
  );
  const streamRef = useRef<HTMLDivElement>(null);
  const replyFileInput = useRef<HTMLInputElement>(null);
  const replySubmitting = useRef(false);
  const phones = useMemo(
    () => splitInternationalPhones(phonesText),
    [phonesText],
  );
  const invalidPhones = phones.filter((item) => !isInternationalPhone(item));

  const load = useCallback(async () => {
    const [a, c, s] = await Promise.all([
      fetch("/api/whatsapp/accounts", { cache: "no-store" }),
      fetch("/api/whatsapp/conversations", { cache: "no-store" }),
      fetch("/api/whatsapp/service", { cache: "no-store" }),
    ]);
    if (a.ok) setAccounts(await a.json());
    if (c.ok) setChats(await c.json());
    if (s.ok) setServiceAvailable(Boolean((await s.json()).available));
  }, []);
  const open = useCallback(async (id: string) => {
    window.location.assign(`/whatsapp/chat/${encodeURIComponent(id)}`);
  }, []);
  useEffect(() => {
    void load();
    const requested = new URLSearchParams(window.location.search).get(
      "conversation",
    );
    if (requested) void open(requested);
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [load, open]);
  useEffect(() => {
    if (active) void open(active.id);
  }, [chats, active?.id, open]);
  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [active?.messages.length]);
  useEffect(() => {
    if (
      qrAccount &&
      accounts.some(
        (account) => account.id === qrAccount && account.status === "connected",
      )
    ) {
      setModal(null);
      setQrCode(null);
      setQrAccount(null);
      setNotice("WhatsApp connected successfully");
    }
  }, [accounts, qrAccount]);
  useEffect(() => {
    if (modal !== "qr" || !qrAccount) return;
    const timer = window.setInterval(
      () => void requestQr(qrAccount, true),
      4000,
    );
    return () => window.clearInterval(timer);
  }, [modal, qrAccount]);

  function openCreate() {
    setModal("create");
    setQrCode(null);
    setQrAccount(null);
    setError("");
    setNotice("");
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setModal("qr");
    setBusy(true);
    setError("");
    setQrCode(null);
    const response = await fetch("/api/whatsapp/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionName }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setModal("create");
      setError(body.error ?? "Could not prepare WhatsApp");
      return;
    }
    setQrAccount(body.account.id);
    setQrCode(body.qrCode ?? null);
    setConnectionName("");
    await load();
  }
  async function requestQr(accountId: string, background = false) {
    setModal("qr");
    setQrAccount(accountId);
    if (!background) {
      setQrCode(null);
      setBusy(true);
      setError("");
    }
    const response = await fetch("/api/whatsapp/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId, action: "qr" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!background) setBusy(false);
    if (!response.ok) {
      if (!background) setError(body.error ?? "QR code is not available");
      return;
    }
    setError("");
    setQrCode(body.qrCode ?? null);
    if (body.status === "connected") {
      setModal(null);
      setNotice("WhatsApp connected successfully");
      await load();
    }
  }
  async function sessionAction(
    accountId: string,
    action: "start" | "stop" | "logout",
  ) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/whatsapp/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId, action }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Could not update the connection");
      return;
    }
    if (action === "start" && body.status !== "ready")
      void requestQr(accountId);
    await load();
  }
  async function remove(account: Account) {
    setBusy(true);
    const response = await fetch("/api/whatsapp/accounts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: account.id, confirmation: "DELETE" }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Could not delete this account");
      return;
    }
    setNotice("WhatsApp account deleted");
    setConfirmState(null);
    if (active?.account.id === account.id) setActive(null);
    await load();
  }
  async function send(
    accountId: string,
    recipients: string[],
    message: string,
  ) {
    const response = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId, phones: recipients, message }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 207)
      throw new Error(body.error ?? "Message could not be sent");
    return body;
  }
  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (phones.length > 3) {
      setError(
        "Direct messages support up to 3 recipients. Use Broadcast for larger lists.",
      );
      return;
    }
    if (invalidPhones.length) {
      setError("Every number must start with + and include its country code.");
      return;
    }
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    try {
      const body = await send(
        String(data.get("accountId")),
        phones,
        String(data.get("message")),
      );
      setNotice(
        `${body.sent} message${body.sent === 1 ? "" : "s"} sent${body.failed ? `, ${body.failed} failed` : ""}`,
      );
      form.reset();
      setPhonesText("");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Message could not be sent",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || replySubmitting.current) return;
    const form = event.currentTarget,
      message = String(new FormData(form).get("message") || "").trim();
    if (!message && !replyImage)
      return setError("Write a message or choose an image.");
    replySubmitting.current = true;
    setBusy(true);
    setError("");
    const selectedImage = replyImage;
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const previewUrl = selectedImage ? URL.createObjectURL(selectedImage) : "";
    setActive((current) => current ? {
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
    if (replyFileInput.current) replyFileInput.current.value = "";
    setReplyImage(null);
    try {
      const phone = active.contactPhone.startsWith("+")
        ? active.contactPhone
        : `+${active.contactPhone}`;
      if (selectedImage) {
        const body = new FormData();
        body.set("accountId", active.account.id);
        body.set("phone", phone);
        body.set("caption", message);
        body.set("image", selectedImage);
        const response = await fetch("/api/whatsapp/send-image", {
          method: "POST",
          body,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            result.error || "Image could not be sent",
          );
        if (result.message)
          setActive((current) => current ? {
            ...current,
            lastMessageAt: result.message.sentAt,
            messages: current.messages.map((item) => item.id === optimisticId ? result.message : item),
          } : current);
      } else await send(active.account.id, [phone], message);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      await load();
    } catch (reason) {
      if (optimisticId)
        setActive((current) => current ? {
          ...current,
          messages: current.messages.filter((item) => item.id !== optimisticId),
        } : current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setError(reason instanceof Error ? reason.message : "Reply failed");
    } finally {
      replySubmitting.current = false;
      setBusy(false);
    }
  }
  async function addContact(chat: Conversation | null = active) {
    if (!chat) return;
    const phone = chat.contactPhone.startsWith("+")
      ? chat.contactPhone
      : `+${chat.contactPhone}`;
    const response = await fetch("/api/contacts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: chat.contactName || phone, phone, conversationId: chat.id }),
    });
    if (response.ok)
      setNotice(`${chat.contactName || phone} (${phone}) added to contacts`);
    else
      setError((await response.json()).error ?? "Contact could not be saved");
  }
  async function clearRecent() {
    if (!chats.length) return;
    setBusy(true);
    const response = await fetch("/api/whatsapp/conversations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    setBusy(false);
    if (response.ok) {
      setChats([]);
      setConfirmState(null);
      setNotice("Recent WhatsApp chats cleared");
    } else
      setError(
        (await response.json()).error ?? "Recent chats could not be cleared",
      );
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>WhatsApp</h1>
          <p>
            Connect accounts, open real conversations and reply from one
            workspace.
          </p>
        </div>
        <button
          className="primary-button compact"
          disabled={serviceAvailable === false}
          onClick={openCreate}
        >
          <Plus size={16} />
          Connect WhatsApp
        </button>
      </header>
      {serviceAvailable === false ? (
        <p className="service-unavailable" role="status">
          <strong>OpenWA is unavailable.</strong> Saved accounts stay safe while
          the service reconnects.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}
      <Panel className="connections-panel">
        <div className="connection-card-grid">
          {accounts.map((account) => (
            <article className="provider-card" key={account.id}>
              {account.avatarUrl ? (
                <img
                  className="provider-avatar"
                  src={account.avatarUrl}
                  alt=""
                />
              ) : (
                <span className="channel-icon is-whatsapp">
                  <FaWhatsapp />
                </span>
              )}
              <div className="provider-card-copy">
                <strong>{account.displayName || account.sessionName}</strong>
                <small>
                  {account.phoneNumber || account.sessionName}
                  {account.lastConnectedAt
                    ? ` · connected ${formatDistanceToNow(new Date(account.lastConnectedAt), { addSuffix: true })}`
                    : ""}
                </small>
                {account.lastError ? (
                  <small className="provider-error">{account.lastError}</small>
                ) : null}
              </div>
              <span className={`provider-status is-${account.status}`}>
                {account.status.replaceAll("_", " ")}
              </span>
              <div className="provider-actions">
                {qrStates.has(account.status) ? (
                  <button
                    className="secondary-button compact"
                    disabled={serviceAvailable === false}
                    onClick={() => void requestQr(account.id)}
                  >
                    <QrCode size={15} />
                    Show QR
                  </button>
                ) : null}
                {account.status === "connected" ? (
                  <button
                    className="icon-action"
                    title="Disconnect"
                    aria-label={`Disconnect ${account.sessionName}`}
                    onClick={() => void sessionAction(account.id, "stop")}
                  >
                    <Power size={16} />
                  </button>
                ) : (
                  <button
                    className="icon-action"
                    title="Reconnect"
                    aria-label={`Reconnect ${account.sessionName}`}
                    onClick={() => void sessionAction(account.id, "start")}
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
                <button
                  className="icon-action"
                  title="Logout linked device"
                  aria-label={`Logout ${account.sessionName}`}
                  onClick={() => void sessionAction(account.id, "logout")}
                >
                  <LogOut size={16} />
                </button>
                <button
                  className="icon-action danger-icon"
                  title="Delete connection"
                  aria-label={`Delete ${account.sessionName}`}
                  onClick={() => setConfirmState({ kind: "delete", account })}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
          {accounts.length === 0 ? (
            <div className="connection-empty">
              <span className="channel-icon is-whatsapp">
                <FaWhatsapp />
              </span>
              <h2>No WhatsApp accounts yet</h2>
              <p>Connect an account and scan the QR code.</p>
              <button className="primary-button" onClick={openCreate}>
                Connect WhatsApp
              </button>
            </div>
          ) : null}
        </div>
      </Panel>
      {accounts.length > 0 ? (
        <>
          <div className="channel-grid">
            <Panel className="resource-form-panel">
              <h2>Send a message</h2>
              <p className="panel-intro">
                Send to up to three numbers. Every number must include{" "}
                <strong>+country code</strong>.
              </p>
              <form className="resource-form single" onSubmit={sendMessage}>
                <label>
                  Sending account
                  <select name="accountId" required>
                    {accounts
                      .filter((account) => account.status === "connected")
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.displayName || account.sessionName}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Phone numbers
                  <textarea
                    value={phonesText}
                    onChange={(event) => setPhonesText(event.target.value)}
                    placeholder={"+201234567890\n+971501234567"}
                    required
                  />
                  <small
                    className={invalidPhones.length ? "field-warning" : ""}
                  >
                    {invalidPhones.length
                      ? "Add + and the country code to every number."
                      : `${phones.length} recipient${phones.length === 1 ? "" : "s"} detected`}
                  </small>
                </label>
                <label>
                  Message
                  <textarea name="message" required maxLength={4096} />
                </label>
                {phones.length > 3 ? (
                  <div className="broadcast-handoff">
                    <span>
                      More than 3 recipients should be sent as a campaign.
                    </span>
                    <Link
                      className="secondary-button compact"
                      href="/broadcast"
                    >
                      Open Broadcast
                    </Link>
                  </div>
                ) : null}
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    phones.length === 0 ||
                    phones.length > 3 ||
                    invalidPhones.length > 0
                  }
                >
                  <Send size={16} />
                  {busy ? "Sending…" : "Send message"}
                </button>
              </form>
            </Panel>
            <Panel className="resource-form-panel">
              <div className="panel-header recent-heading">
                <div>
                  <h2>Recent chats</h2>
                  <p>Latest conversations across connected accounts</p>
                </div>
                <button
                  className="clear-recent-button"
                  onClick={() => setConfirmState({ kind: "clear" })}
                  disabled={!chats.length}
                >
                  <Eraser size={15} />
                  Clear recent
                </button>
              </div>
              <div className="recent-feed is-clickable">
                {chats.length ? (
                  chats.map((chat) => (
                    <article className="recent-chat-row" key={chat.id}>
                      <button
                        className="recent-chat-open"
                        onClick={() => void open(chat.id)}
                      >
                        <Avatar
                          id={chat.id}
                          label={chat.contactName || chat.contactPhone}
                        />
                        <span className="recent-chat-copy">
                          <strong>
                            {chat.contactName || chat.contactPhone}
                          </strong>
                          <span>
                            {chat.messages[0]?.content ||
                              chat.messages[0]?.type ||
                              "No messages yet"}
                          </span>
                          <small>
                            via {chat.account.sessionName}
                            {chat.lastMessageAt
                              ? ` · ${formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true })}`
                              : ""}
                          </small>
                        </span>
                        {chat.unreadCount ? (
                          <b className="unread">{chat.unreadCount}</b>
                        ) : null}
                      </button>
                      <button
                        className="recent-contact-action"
                        title="Add to contacts"
                        aria-label={`Add ${chat.contactName || chat.contactPhone} to contacts`}
                        onClick={() => void addContact(chat)}
                      >
                        <ContactRound size={16} />
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="muted-copy">No conversations yet.</p>
                )}
              </div>
            </Panel>
          </div>
          {active ? (
            <Panel className="channel-conversation">
              <div className="conversation-heading">
                <div className="conversation-person">
                  <Avatar
                    id={active.id}
                    label={active.contactName || active.contactPhone}
                  />
                  <span>
                    <strong>{active.contactName || active.contactPhone}</strong>
                    <small>
                      {active.lastMessageAt
                        ? `Last seen ${formatDistanceToNow(new Date(active.lastMessageAt), { addSuffix: true })}`
                        : "Last seen unavailable"}{" "}
                      · via {active.account.sessionName}
                    </small>
                  </span>
                </div>
                <button
                  className="secondary-button compact"
                  onClick={() => void addContact()}
                >
                  <ContactRound size={16} />
                  Add to contacts
                </button>
              </div>
              <div className="message-stream" ref={streamRef}>
                {active.messages.map((message) => (
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
                        <WorkspaceMessageStatus status={message.status} />
                      ) : null}
                    </time>
                  </article>
                ))}
              </div>
              <form className="message-reply" onSubmit={reply}>
                <div className="chat-composer-field">
                  {replyImage ? (
                    <div className="chat-image-selection">
                      <ImagePlus size={16} />
                      <span>{busy ? `Sending ${replyImage.name}…` : replyImage.name}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { setReplyImage(null); if (replyFileInput.current) replyFileInput.current.value = ""; }}
                        aria-label="Remove selected image"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    name="message"
                    placeholder={
                      replyImage
                        ? "Add a caption…"
                        : `Message ${active.contactName || active.contactPhone}`
                    }
                    maxLength={4096}
                  />
                </div>
                <label className="chat-attach-button" title="Send an image">
                  <ImagePlus size={19} />
                  <input
                    ref={replyFileInput}
                    type="file"
                    disabled={busy}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) =>
                      setReplyImage(event.target.files?.[0] || null)
                    }
                  />
                  <span className="sr-only">Choose image</span>
                </label>
                <button className="primary-button" disabled={busy}>
                  <Send size={16} />
                  {busy ? "Sending…" : "Send"}
                </button>
              </form>
            </Panel>
          ) : null}
        </>
      ) : null}
      {modal ? (
        <div className="modal-backdrop">
          <section
            className="resource-modal connect-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-connect-title"
          >
            <div className="modal-heading">
              <div>
                <h2 id="wa-connect-title">
                  {modal === "qr"
                    ? "Scan this QR code"
                    : "Name this connection"}
                </h2>
                <p>
                  {modal === "qr"
                    ? "Open WhatsApp → Settings → Linked Devices → Link a Device."
                    : "Use a clear name so you can identify this account."}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                <X />
              </button>
            </div>
            {modal === "qr" ? (
              <div className="qr-stage">
                {qrCode ? (
                  <img src={qrCode} alt="WhatsApp connection QR code" />
                ) : (
                  <div className="qr-loading">
                    <RefreshCw className="is-spinning" />
                    <strong>Preparing the QR code…</strong>
                    <p>It appears automatically as soon as OpenWA is ready.</p>
                  </div>
                )}
                <button
                  className="secondary-button"
                  disabled={busy || !qrAccount}
                  onClick={() => qrAccount && void requestQr(qrAccount)}
                >
                  <RefreshCw size={16} />
                  {busy ? "Checking…" : "Refresh QR"}
                </button>
              </div>
            ) : (
              <form className="resource-form modal-form" onSubmit={connect}>
                <label className="modal-field">
                  Connection name
                  <input
                    value={connectionName}
                    onChange={(event) => setConnectionName(event.target.value)}
                    placeholder="e.g. Sales team"
                    maxLength={80}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary-button" disabled={busy}>
                    {busy ? "Preparing…" : "Continue to QR"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmState?.kind === "delete"}
        title="Delete WhatsApp connection?"
        description={confirmState?.kind === "delete" ? `This permanently removes ${confirmState.account.sessionName} and all of its saved conversations from your workspace. New provider cleanup will continue in the background.` : ""}
        confirmLabel="Delete connection"
        requireText="DELETE"
        busy={busy}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.kind === "delete" ? remove(confirmState.account) : undefined}
      />
      <ConfirmDialog
        open={confirmState?.kind === "clear"}
        title="Clear recent WhatsApp chats?"
        description="This only clears the recent list. New incoming messages will make conversations appear again."
        confirmLabel="Clear recent"
        tone="neutral"
        busy={busy}
        onCancel={() => setConfirmState(null)}
        onConfirm={clearRecent}
      />
    </>
  );
}

function WorkspaceMessageStatus({ status }: { status: string }) {
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

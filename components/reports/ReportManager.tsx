"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  LifeBuoy,
  MessageSquare,
  Send,
  ShieldAlert,
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useAutoRefresh } from "@/lib/client/use-auto-refresh";

type Severity = "low" | "normal" | "high" | "risk";
type ContactDraft = {
  contactName: string;
  contactEmail: string;
  severity: Severity;
  subject: string;
  body: string;
};
type Reply = {
  id: string;
  body: string;
  createdAt?: string;
  guestName?: string | null;
  user?: { name?: string; role: string } | null;
};
type Report = {
  id: string;
  contactName: string;
  contactEmail: string;
  severity: Severity;
  subject: string;
  body: string;
  status: string;
  createdAt?: string;
  replies: Reply[];
  user?: { id: string; name?: string; email: string } | null;
};
type Me = { name?: string; email: string; role: string };
const severityOptions = [
  { value: "low", label: "Low", description: "A question or general inquiry." },
  {
    value: "normal",
    label: "Normal",
    description: "A small issue we can help resolve.",
  },
  {
    value: "high",
    label: "High",
    description: "A site problem that may need an update.",
  },
  {
    value: "risk",
    label: "Risk",
    description: "A potential security issue on the platform.",
  },
] as const;
const emptyForm: ContactDraft = {
  contactName: "",
  contactEmail: "",
  severity: "normal",
  subject: "",
  body: "",
};

export function ReportManager() {
  const [items, setItems] = useState<Report[]>([]),
    [me, setMe] = useState<Me | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [form, setForm] = useState<ContactDraft>(emptyForm),
    [tab, setTab] = useState<"open" | "closed">("open"),
    [selected, setSelected] = useState<Report | null>(null),
    [busy, setBusy] = useState(false),
    [ownerView, setOwnerView] = useState<"inbox" | "support">("inbox");
  const moderate = me
    ? ["owner", "admin", "moderator"].includes(me.role)
    : false;
  const load = useCallback(async () => {
    const [r, m] = await Promise.all([
      fetch("/api/reports?limit=100", { cache: "no-store" }),
      fetch("/api/me", { cache: "no-store" }),
    ]);
    const body = await r.json();
    if (r.ok) {
      setItems(body.items);
      setSelected((old) =>
        old
          ? body.items.find((item: Report) => item.id === old.id) || null
          : null,
      );
    } else setError(body.error);
    if (m.ok) {
      const user = (await m.json()) as Me;
      setMe(user);
      setForm((current) => ({
        ...current,
        contactName: current.contactName || user.name || "",
        contactEmail: current.contactEmail || user.email || "",
      }));
    }
  }, []);
  useEffect(() => {
    void load();
    const ticket = new URLSearchParams(window.location.search).get("ticket");
    if (ticket) setSelected({ id: ticket } as Report);
  }, [load]);
  useAutoRefresh(load);
  const visible = useMemo(
    () =>
      items.filter((report) =>
        tab === "closed"
          ? ["resolved", "closed"].includes(report.status)
          : !["resolved", "closed"].includes(report.status),
      ),
    [items, tab],
  );
  const mine = useMemo(
    () => items.filter((report) => report.user?.email === me?.email),
    [items, me?.email],
  );
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!response.ok) return setError((await response.json()).error);
    setSuccess("Your message was sent. Our team will follow up here.");
    setForm((current) => ({
      ...emptyForm,
      contactName: current.contactName,
      contactEmail: current.contactEmail,
    }));
    await load();
  }
  async function status(id: string, value: string) {
    const r = await fetch(`/api/reports/${id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: value }),
    });
    if (!r.ok) setError((await r.json()).error);
    await load();
  }
  async function reply(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget,
      body = String(new FormData(formElement).get("body") || "").trim();
    if (!body) return;
    const r = await fetch(`/api/reports/${id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (r.ok) {
      formElement.reset();
      setSuccess("Reply sent.");
      await load();
    } else setError((await r.json()).error);
  }
  if (!me) return <div className="support-loading">Loading support…</div>;
  if (moderate && !(me.role === "owner" && ownerView === "support"))
    return (
      <>
        <header className="workspace-header">
          <div>
            <h1>Support inbox</h1>
            <p>Review user messages and keep every response in one thread.</p>
          </div>
          {me.role === "owner" ? (
            <button
              className="secondary-button"
              onClick={() => {
                setOwnerView("support");
                setSelected(null);
              }}
            >
              <LifeBuoy size={16} />
              Get support
            </button>
          ) : null}
        </header>
        <SupportInbox
          items={items}
          visible={visible}
          tab={tab}
          selected={selected}
          error={error}
          onTab={setTab}
          onSelect={setSelected}
          onStatus={status}
          onReply={reply}
        />
      </>
    );
  return (
    <>
      <header className="workspace-header contact-heading">
        <div>
          <h1>Contact support</h1>
          <p>
            Open a ticket, read staff replies and continue the same conversation
            at any time.
          </p>
        </div>
        {me.role === "owner" ? (
          <button
            className="secondary-button"
            onClick={() => {
              setOwnerView("inbox");
              setSelected(null);
            }}
          >
            <MessageSquare size={16} />
            Support inbox
          </button>
        ) : null}
      </header>
      <ContactPortal
        form={form}
        items={mine}
        selected={
          selected && mine.some((item) => item.id === selected.id)
            ? selected
            : null
        }
        error={error}
        success={success}
        busy={busy}
        onChange={setForm}
        onSubmit={create}
        onSelect={setSelected}
        onReply={reply}
      />
    </>
  );
}

function ContactPortal({
  form,
  items,
  selected,
  error,
  success,
  busy,
  onChange,
  onSubmit,
  onSelect,
  onReply,
}: {
  form: typeof emptyForm;
  items: Report[];
  selected: Report | null;
  error: string;
  success: string;
  busy: boolean;
  onChange: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  onSubmit: (e: React.FormEvent) => void;
  onSelect: (item: Report) => void;
  onReply: (id: string, e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <div className="contact-layout">
      <Panel className="contact-card">
        <div className="contact-card-title">
          <span>
            <LifeBuoy size={21} />
          </span>
          <div>
            <h2>How can we help?</h2>
            <p>Account details are filled automatically.</p>
          </div>
        </div>
        <form className="contact-form" onSubmit={onSubmit}>
          <div className="form-split">
            <label>
              Full name
              <input
                value={form.contactName}
                onChange={(e) =>
                  onChange((v) => ({ ...v, contactName: e.target.value }))
                }
                autoComplete="name"
                required
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) =>
                  onChange((v) => ({ ...v, contactEmail: e.target.value }))
                }
                autoComplete="email"
                required
              />
            </label>
          </div>
          <fieldset className="severity-fieldset">
            <legend>How serious is this?</legend>
            <div className="severity-options">
              {severityOptions.map((option) => (
                <label
                  className={`severity-option is-${option.value}`}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="severity"
                    value={option.value}
                    checked={form.severity === option.value}
                    onChange={() =>
                      onChange((v) => ({ ...v, severity: option.value }))
                    }
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {form.severity === "risk" ? (
            <div className="security-note">
              <ShieldAlert size={19} />
              <p>
                <strong>Security report</strong> Do not include passwords,
                tokens or private customer data.
              </p>
            </div>
          ) : null}
          <label>
            Subject
            <input
              value={form.subject}
              onChange={(e) =>
                onChange((v) => ({ ...v, subject: e.target.value }))
              }
              placeholder="Short summary"
              required
            />
          </label>
          <label>
            Message
            <textarea
              value={form.body}
              onChange={(e) =>
                onChange((v) => ({ ...v, body: e.target.value }))
              }
              placeholder="Share the details"
              required
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="form-success" role="status">
              <CheckCircle2 size={17} />
              {success}
            </p>
          ) : null}
          <button className="primary-button contact-submit" disabled={busy}>
            <Send size={17} />
            {busy ? "Sending…" : "Send message"}
          </button>
        </form>
      </Panel>
      <div className="support-thread-stack">
        <Panel className="request-history">
          <div className="panel-header">
            <div>
              <h2>Your tickets</h2>
              <p>Select a ticket to continue the conversation.</p>
            </div>
          </div>
          {items.length ? (
            <div className="request-list is-clickable">
              {items.map((item) => (
                <button
                  key={item.id}
                  className={selected?.id === item.id ? "active" : ""}
                  onClick={() => onSelect(item)}
                >
                  <span className={`severity-dot is-${item.severity}`} />
                  <span>
                    <strong>{item.subject}</strong>
                    <small>
                      {item.severity} · {item.status.replaceAll("_", " ")} ·{" "}
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString()
                        : ""}
                    </small>
                  </span>
                  {item.replies.length ? <b>{item.replies.length}</b> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="contact-empty">
              <MessageSquare size={24} />
              <p>You haven’t contacted support yet.</p>
            </div>
          )}
        </Panel>
        {selected ? (
          <Panel className="customer-ticket-thread">
            <div className="panel-header">
              <div>
                <span className={`severity-badge is-${selected.severity}`}>
                  {selected.status.replaceAll("_", " ")}
                </span>
                <h2>{selected.subject}</h2>
              </div>
            </div>
            <p className="ticket-body">{selected.body}</p>
            <div className="reply-list">
              {selected.replies.map((reply) => (
                <blockquote key={reply.id}>
                  <strong>
                    {reply.user?.name || reply.user?.role || reply.guestName || "Support"}
                  </strong>
                  <p>{reply.body}</p>
                </blockquote>
              ))}
            </div>
            {selected.status === "closed" ? (
              <p className="ticket-locked">
                This ticket is closed. Open a new request if you still need help.
              </p>
            ) : (
              <form
                className="reply-form"
                onSubmit={(e) => void onReply(selected.id, e)}
              >
                <input
                  name="body"
                  placeholder={
                    selected.status === "resolved"
                      ? "Reply to reopen this ticket…"
                      : "Continue this conversation…"
                  }
                  required
                />
                <button className="primary-button compact">
                  {selected.status === "resolved" ? "Reopen & reply" : "Send reply"}
                </button>
              </form>
            )}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function SupportInbox({
  items,
  visible,
  tab,
  selected,
  error,
  onTab,
  onSelect,
  onStatus,
  onReply,
}: {
  items: Report[];
  visible: Report[];
  tab: "open" | "closed";
  selected: Report | null;
  error: string;
  onTab: (tab: "open" | "closed") => void;
  onSelect: (item: Report) => void;
  onStatus: (id: string, value: string) => Promise<void>;
  onReply: (id: string, e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <>
      <div className="ticket-tabs">
        <button
          className={tab === "open" ? "active" : ""}
          onClick={() => onTab("open")}
        >
          Open{" "}
          <span>
            {
              items.filter((x) => !["resolved", "closed"].includes(x.status))
                .length
            }
          </span>
        </button>
        <button
          className={tab === "closed" ? "active" : ""}
          onClick={() => onTab("closed")}
        >
          Closed{" "}
          <span>
            {
              items.filter((x) => ["resolved", "closed"].includes(x.status))
                .length
            }
          </span>
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="ticket-layout">
        <Panel className="ticket-list">
          {visible.length ? (
            visible.map((report) => (
              <button
                key={report.id}
                className={selected?.id === report.id ? "active" : ""}
                onClick={() => onSelect(report)}
              >
                <span className={`ticket-severity is-${report.severity}`}>
                  {report.severity === "risk" ? (
                    <ShieldAlert size={16} />
                  ) : report.severity === "high" ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <MessageSquare size={16} />
                  )}
                </span>
                <span>
                  <strong>{report.subject}</strong>
                  <small>
                    {report.contactName} · {report.contactEmail}
                  </small>
                </span>
                <em>{report.severity}</em>
              </button>
            ))
          ) : (
            <div className="empty-state">No {tab} messages.</div>
          )}
        </Panel>
        <Panel className="ticket-detail">
          {selected ? (
            <>
              <div className="panel-header">
                <div>
                  <span className={`severity-badge is-${selected.severity}`}>
                    {selected.severity} impact
                  </span>
                  <h2>{selected.subject}</h2>
                  <p>
                    {selected.contactName} · {selected.contactEmail}
                  </p>
                </div>
                <select
                  value={selected.status}
                  onChange={(e) => void onStatus(selected.id, e.target.value)}
                >
                  {["open", "in_review", "resolved", "closed"].map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <p className="ticket-body">{selected.body}</p>
              <div className="reply-list">
                {selected.replies.map((reply) => (
                  <blockquote key={reply.id}>
                    <strong>
                      {reply.user?.name ||
                        reply.user?.role ||
                        reply.guestName ||
                        selected.contactName}
                    </strong>
                    <p>{reply.body}</p>
                  </blockquote>
                ))}
              </div>
              {selected.status === "closed" ? (
                <p className="ticket-locked">
                  This ticket is closed and cannot receive more replies.
                </p>
              ) : (
                <form
                  className="reply-form"
                  onSubmit={(e) => void onReply(selected.id, e)}
                >
                  <input
                    name="body"
                    placeholder="Write a helpful reply…"
                    required
                  />
                  <button className="primary-button compact">Send reply</button>
                </form>
              )}
            </>
          ) : (
            <div className="empty-state">
              Select a message to see the conversation.
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

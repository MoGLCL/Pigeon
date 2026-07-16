"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarClock,
  MessageCircleReply,
  MessagesSquare,
  Send,
  Trash2,
} from "lucide-react";
import { FaFacebookF, FaFacebookMessenger, FaWhatsapp } from "react-icons/fa";
import { Panel } from "@/components/ui/Panel";

type Kind = "whatsapp" | "messenger" | "facebook_comment" | "facebook_post";
type Account = {
  id: string;
  sessionName: string;
  displayName?: string;
  status: string;
  avatarUrl?: string;
};
type Page = { id: string; name: string; avatarUrl?: string; status: string };
type Rule = {
  id: string;
  name: string;
  channel: Kind;
  trigger: string;
  keywords: string[];
  replyMessage: string;
  actions?: { scheduledAt?: string };
  isActive: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
  fbPage?: { name: string; avatarUrl?: string };
  waAccount?: { sessionName: string; displayName?: string; avatarUrl?: string };
};
const tabs = [
  {
    id: "whatsapp" as const,
    label: "WhatsApp replies",
    icon: FaWhatsapp,
    description: "Reply automatically to incoming WhatsApp messages.",
  },
  {
    id: "messenger" as const,
    label: "Messenger replies",
    icon: FaFacebookMessenger,
    description: "Reply to Page messages from the correct Facebook Page.",
  },
  {
    id: "facebook_comment" as const,
    label: "Comment replies",
    icon: MessageCircleReply,
    description: "Respond automatically to new Facebook comments.",
  },
  {
    id: "facebook_post" as const,
    label: "Publish posts",
    icon: CalendarClock,
    description: "Schedule a Facebook Page post for automatic publishing.",
  },
];

export function AutomationWorkspace() {
  const [kind, setKind] = useState<Kind>("whatsapp"),
    [rules, setRules] = useState<Rule[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [pages, setPages] = useState<Page[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [r, a, p] = await Promise.all([
      fetch("/api/automation", { cache: "no-store" }),
      fetch("/api/whatsapp/accounts", { cache: "no-store" }),
      fetch("/api/facebook/pages", { cache: "no-store" }),
    ]);
    if (r.ok) setRules(await r.json());
    if (a.ok) setAccounts(await a.json());
    if (p.ok) setPages(await p.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const available =
    kind === "whatsapp"
      ? accounts.filter((item) => item.status === "connected")
      : pages.filter((item) => item.status === "connected");
  const visible = useMemo(
    () => rules.filter((rule) => rule.channel === kind),
    [rules, kind],
  );
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = event.currentTarget,
      data = new FormData(form),
      keywords = String(data.get("keywords") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      accountId = String(data.get("accountId") || "");
    const payload = {
      name: data.get("name"),
      channel: kind,
      trigger:
        kind === "facebook_post"
          ? "scheduled_publish"
          : kind === "facebook_comment"
            ? "new_comment"
            : "new_message",
      keywords,
      replyMessage: data.get("replyMessage"),
      isActive: true,
      ...(kind === "whatsapp"
        ? { waAccountId: accountId }
        : { fbPageId: accountId }),
      actions:
        kind === "facebook_post"
          ? { scheduledAt: data.get("scheduledAt") }
          : undefined,
    };
    const response = await fetch("/api/automation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Automation could not be saved");
      return;
    }
    form.reset();
    setNotice(
      kind === "facebook_post"
        ? "Post scheduled successfully."
        : "Automation is active.",
    );
    await load();
  }
  async function toggle(rule: Rule) {
    const response = await fetch("/api/automation", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
    });
    if (response.ok) await load();
    else setError((await response.json()).error);
  }
  async function remove(rule: Rule) {
    if (!window.confirm(`Delete ${rule.name}?`)) return;
    const response = await fetch("/api/automation", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: rule.id }),
    });
    if (response.ok) await load();
    else setError((await response.json()).error);
  }
  const tab = tabs.find((item) => item.id === kind)!;
  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Automation</h1>
          <p>
            Build channel-specific workflows with your real connected accounts.
          </p>
        </div>
        <span className="automation-mark">
          <Bot />
        </span>
      </header>
      <div
        className="automation-tabs"
        role="tablist"
        aria-label="Automation type"
      >
        {tabs.map((item) => (
          <button
            role="tab"
            aria-selected={kind === item.id}
            className={kind === item.id ? "active" : ""}
            key={item.id}
            onClick={() => {
              setKind(item.id);
              setError("");
              setNotice("");
            }}
          >
            <item.icon />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
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
      <div className="automation-grid">
        <Panel className="automation-builder">
          <div className="automation-section-title">
            <span>
              <tab.icon />
            </span>
            <div>
              <h2>{tab.label}</h2>
              <p>{tab.description}</p>
            </div>
          </div>
          <form className="resource-form single" onSubmit={create}>
            <label>
              Automation name
              <input
                name="name"
                placeholder={
                  kind === "facebook_post"
                    ? "Tuesday product update"
                    : "Welcome response"
                }
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label>
              {kind === "whatsapp" ? "WhatsApp account" : "Facebook Page"}
              <select name="accountId" required defaultValue="">
                <option value="" disabled>
                  Choose {kind === "whatsapp" ? "an account" : "a Page"}
                </option>
                {available.map((item) => (
                  <option value={item.id} key={item.id}>
                    {"sessionName" in item
                      ? item.displayName || item.sessionName
                      : item.name}
                  </option>
                ))}
              </select>
              <small>
                {available.length
                  ? "Only connected accounts are shown."
                  : `Connect ${kind === "whatsapp" ? "WhatsApp" : "Facebook"} first to enable this automation.`}
              </small>
            </label>
            {kind !== "facebook_post" ? (
              <label>
                Match keywords <span className="optional">Optional</span>
                <input name="keywords" placeholder="price, hours, support" />
                <small>
                  Comma separated. Leave empty to reply to every new{" "}
                  {kind === "facebook_comment" ? "comment" : "message"}.
                </small>
              </label>
            ) : (
              <label>
                Publish date and time
                <input
                  name="scheduledAt"
                  type="datetime-local"
                  required
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                />
                <small>
                  The post publishes using the selected Page’s timezone
                  configuration.
                </small>
              </label>
            )}
            <label>
              {kind === "facebook_post" ? "Post content" : "Automatic reply"}
              <textarea
                name="replyMessage"
                required
                maxLength={4000}
                placeholder={
                  kind === "facebook_post"
                    ? "Write the post exactly as it should appear…"
                    : "Write the response…"
                }
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || available.length === 0}
            >
              {kind === "facebook_post" ? (
                <CalendarClock size={17} />
              ) : (
                <Send size={17} />
              )}{" "}
              {busy
                ? "Saving…"
                : kind === "facebook_post"
                  ? "Schedule post"
                  : "Activate automation"}
            </button>
          </form>
        </Panel>
        <Panel className="automation-list">
          <div className="panel-header">
            <div>
              <h2>{tab.label}</h2>
              <p>
                {visible.length} configured workflow
                {visible.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {visible.length ? (
            <div className="automation-rules">
              {visible.map((rule) => (
                <article key={rule.id}>
                  <span className={`rule-icon is-${rule.channel}`}>
                    {rule.channel === "whatsapp" ? (
                      <FaWhatsapp />
                    ) : rule.channel === "messenger" ? (
                      <FaFacebookMessenger />
                    ) : rule.channel === "facebook_post" ? (
                      <CalendarClock />
                    ) : (
                      <FaFacebookF />
                    )}
                  </span>
                  <div>
                    <strong>{rule.name}</strong>
                    <p>{rule.replyMessage}</p>
                    <small>
                      {rule.waAccount?.displayName ||
                        rule.waAccount?.sessionName ||
                        rule.fbPage?.name}
                      {rule.actions?.scheduledAt
                        ? ` · ${new Date(rule.actions.scheduledAt).toLocaleString()}`
                        : ""}
                    </small>
                  </div>
                  <label className="switch-control">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={() => void toggle(rule)}
                    />
                    <span />
                    <em>{rule.isActive ? "Active" : "Paused"}</em>
                  </label>
                  <button
                    className="icon-action danger-icon"
                    aria-label={`Delete ${rule.name}`}
                    onClick={() => void remove(rule)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="channel-empty">
              <MessagesSquare />
              <h2>No {tab.label.toLowerCase()} yet</h2>
              <p>Complete the form to create the first one.</p>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

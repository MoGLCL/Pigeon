"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Search, Send } from "lucide-react";
import { FaFacebookMessenger, FaWhatsapp } from "react-icons/fa";
import { Panel } from "@/components/ui/Panel";

type Option = { id: string; name?: string; displayName?: string; sessionName?: string; phone?: string; phoneNumber?: string; avatarUrl?: string; participantName?: string; participantAvatarUrl?: string; pageId?: string; page?: { name: string } };
type Data = { campaigns: { id: string; name: string; channel: string; status: string; totalCount: number; sentCount: number; failedCount: number; createdAt: string }[]; senders: { whatsapp: Option[]; messenger: Option[] }; recipients: { whatsapp: Option[]; messenger: Option[] } };
const empty: Data = { campaigns: [], senders: { whatsapp: [], messenger: [] }, recipients: { whatsapp: [], messenger: [] } };
export function BroadcastWorkspace() {
  const [data, setData] = useState<Data>(empty), [channel, setChannel] = useState<"whatsapp" | "messenger">("whatsapp"), [selected, setSelected] = useState<Set<string>>(new Set()), [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/broadcast", { cache: "no-store" }); if (response.ok) setData(await response.json()); }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected(new Set()); setQuery(""); }, [channel]);
  const recipients = useMemo(() => data.recipients[channel].filter((item) => recipientName(item).toLowerCase().includes(query.toLowerCase())), [data, channel, query]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, values = new FormData(form); setBusy(true); setError(""); setNotice("");
    const response = await fetch("/api/broadcast", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, senderId: values.get("senderId"), name: values.get("name"), message, scheduledAt: values.get("scheduledAt") || undefined, recipientIds: [...selected] }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error || "Campaign could not be created");
    setNotice(body.scheduledAt ? "Campaign scheduled" : "Campaign queued for sending"); setSelected(new Set()); setMessage(""); form.reset(); await load();
  }
  return <><header className="workspace-header"><div><h1>Broadcast</h1><p>WhatsApp and Messenger are configured separately so each campaign uses the right account and audience.</p></div></header>
    {error ? <p className="form-error">{error}</p> : null}{notice ? <p className="form-success">{notice}</p> : null}
    <div className="broadcast-layout"><Panel className="broadcast-builder">
      <div className="broadcast-tabs"><button className={channel === "whatsapp" ? "is-active" : ""} onClick={() => setChannel("whatsapp")}><FaWhatsapp/>WhatsApp</button><button className={channel === "messenger" ? "is-active" : ""} onClick={() => setChannel("messenger")}><FaFacebookMessenger/>Messenger</button></div>
      <form className="resource-form single" onSubmit={submit}><label>Campaign name<input name="name" required maxLength={100}/></label><label>Sending {channel === "whatsapp" ? "account" : "Page"}<select name="senderId" required><option value="">Choose sender</option>{data.senders[channel].map((item) => <option value={item.id} key={item.id}>{senderName(item)}</option>)}</select></label><label>Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={4000}/><small>{message.length}/4000</small></label><label>Schedule (optional)<input name="scheduledAt" type="datetime-local"/></label><button className="primary-button" disabled={busy || !selected.size || !data.senders[channel].length}><Send size={16}/>{busy ? "Creating…" : `Send to ${selected.size} recipient${selected.size === 1 ? "" : "s"}`}</button></form>
    </Panel><Panel className="broadcast-audience"><div className="panel-header"><div><h2>{channel === "whatsapp" ? "WhatsApp contacts" : "Messenger people"}</h2><p>{selected.size} selected</p></div><button className="secondary-button compact" onClick={() => setSelected(new Set(recipients.map((item) => item.id)))}>Select visible</button></div><label className="contacts-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipients"/></label><div className="audience-list">{recipients.map((item) => { const active = selected.has(item.id); return <button className={active ? "is-selected" : ""} key={item.id} onClick={() => setSelected((current) => { const next = new Set(current); active ? next.delete(item.id) : next.add(item.id); return next; })}>{avatar(item)}<span><strong>{recipientName(item)}</strong><small>{channel === "whatsapp" ? item.phone : `via ${item.page?.name}`}</small></span><i>{active ? <Check size={14}/> : null}</i></button>; })}{!recipients.length ? <p className="muted-copy">No recipients available for this channel.</p> : null}</div></Panel></div>
    <Panel className="campaign-history"><div className="panel-header"><h2>Campaign history</h2></div>{data.campaigns.map((item) => <article key={item.id}><span className={`channel-icon is-${item.channel}`}>{item.channel === "whatsapp" ? <FaWhatsapp/> : <FaFacebookMessenger/>}</span><div><strong>{item.name}</strong><small>{item.channel} · {new Date(item.createdAt).toLocaleString()}</small></div><b>{item.status}</b><span>{item.sentCount}/{item.totalCount} sent{item.failedCount ? ` · ${item.failedCount} failed` : ""}</span></article>)}</Panel>
  </>;
}
function senderName(item: Option) { return item.displayName || item.sessionName || item.name || item.phoneNumber || "Connected sender"; }
function recipientName(item: Option) { return item.name || item.participantName || item.phone || "Unnamed recipient"; }
function avatar(item: Option) { const url = item.avatarUrl || item.participantAvatarUrl; return url ? <img src={url} alt=""/> : <span className="avatar">{recipientName(item).slice(0, 2).toUpperCase()}</span>; }

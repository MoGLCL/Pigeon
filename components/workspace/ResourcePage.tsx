"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useAutoRefresh } from "@/lib/client/use-auto-refresh";

type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "textarea" | "select" | "datetime-local";
  options?: { label: string; value: string }[];
  required?: boolean;
};

type Props = {
  title: string;
  description: string;
  endpoint: string;
  fields?: Field[];
  columns: string[];
  transform?: "automation" | "broadcast";
};

export function ResourcePage({ title, description, endpoint, fields = [], columns, transform }: Props) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json();
    setItems(Array.isArray(body) ? body : body.items ?? []);
    setError(response.ok ? "" : body.error);
    setLoading(false);
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(load);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const body = transform === "automation"
      ? { ...raw, keywords: raw.keywords ? raw.keywords.split(",").map(item => item.trim()).filter(Boolean) : [], isActive: true }
      : transform === "broadcast"
        ? { ...raw, contactIds: raw.contactIds.split(",").map(item => item.trim()).filter(Boolean), scheduledAt: raw.scheduledAt || undefined }
        : raw;
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return setError((await response.json()).error);
    setShow(false);
    setError("");
    await load();
  }

  return <>
    <header className="workspace-header"><div><h1>{title}</h1><p>{description}</p></div>{fields.length > 0 && <button className="primary-button compact" onClick={() => setShow(true)}><Plus size={16}/>Create new</button>}</header>
    {error && <p className="form-error">{error}</p>}
    <Panel className="table-panel"><div className="data-table">
      <div className="table-row table-head" style={{ gridTemplateColumns: `repeat(${columns.length},minmax(130px,1fr))` }}>{columns.map(column => <span key={column}>{column}</span>)}</div>
      {loading ? <div className="empty-state">Loading…</div> : items.length === 0 ? <div className="empty-state">No data yet. Create your first item when you’re ready.</div> : items.map((item, index) => <div className="table-row" style={{ gridTemplateColumns: `repeat(${columns.length},minmax(130px,1fr))` }} key={String(item.id ?? index)}>{columns.map(column => <span key={column}>{render(item[toKey(column)])}</span>)}</div>)}
    </div></Panel>
    {show && <div className="modal-backdrop"><section className="resource-modal" role="dialog" aria-modal="true" aria-labelledby="new-resource-title">
      <div className="modal-heading"><div><span className="eyebrow">New item</span><h2 id="new-resource-title">Create {title.replace(/s$/i, "")}</h2><p>Add the details below. You can manage it from this page afterward.</p></div><button className="icon-button" onClick={() => setShow(false)} aria-label="Close"><X/></button></div>
      <form className="resource-form modal-form" onSubmit={submit}>{fields.map(field => <label key={field.name}>{field.label}{field.type === "textarea" ? <textarea name={field.name} required={field.required}/> : field.type === "select" ? <select name={field.name} required={field.required}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input name={field.name} type={field.type ?? "text"} required={field.required}/>}</label>)}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShow(false)}>Cancel</button><button className="primary-button">Create</button></div></form>
    </section></div>}
  </>;
}

function toKey(label: string) {
  return ({ Name: "name", Session: "sessionName", "Page ID": "pageId", Channel: "channel", Status: "status", Phone: "phone", Email: "email", Subject: "subject", Role: "role", Created: "createdAt", Message: "message", Trigger: "trigger", Total: "totalCount" } as Record<string, string>)[label] ?? label.toLowerCase();
}

function render(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) return new Date(value).toLocaleDateString();
  return String(value);
}

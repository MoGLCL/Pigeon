"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

type Contact = {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  source?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
};

export function ContactsWorkspace() {
  const [items, setItems] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/contacts", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setItems(body);
    else setError(body.error || "Contacts could not be loaded");
    setLoading(false);
  }, []);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return items;
    return items.filter((item) =>
      [item.name, item.phone, item.email, item.source].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(value),
      ),
    );
  }, [items, query]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(ids?: string[], all = false) {
    const count = all ? items.length : ids?.length || 0;
    if (!count || !confirm(`Delete ${count} contact${count === 1 ? "" : "s"}?`))
      return;
    const response = await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { ids }),
    });
    if (!response.ok) {
      setError(
        (await response.json()).error || "Contacts could not be deleted",
      );
      return;
    }
    setSelected(new Set());
    setError("");
    await load();
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...raw, tags: [] }),
    });
    if (!response.ok) {
      setError((await response.json()).error || "Contact could not be created");
      return;
    }
    form.reset();
    setShowCreate(false);
    setError("");
    await load();
  }

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Contacts</h1>
          <p>A clean customer directory shared by your connected channels.</p>
        </div>
        <button
          className="primary-button compact"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={16} /> Add contact
        </button>
      </header>

      {error && <p className="form-error">{error}</p>}

      <Panel className="contacts-panel">
        <div className="contacts-toolbar">
          <label className="contacts-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone or email"
            />
          </label>
          <span>{items.length} contacts</span>
          {selected.size > 0 && (
            <button
              className="secondary-button compact danger-button"
              onClick={() => void remove([...selected])}
            >
              <Trash2 size={15} /> Delete selected ({selected.size})
            </button>
          )}
          {items.length > 0 && (
            <button
              className="secondary-button compact danger-button"
              onClick={() => void remove(undefined, true)}
            >
              <Trash2 size={15} /> Delete all
            </button>
          )}
        </div>

        <div className="contacts-table">
          <div className="contacts-row contacts-head">
            <label>
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (allVisibleSelected)
                      filtered.forEach((item) => next.delete(item.id));
                    else filtered.forEach((item) => next.add(item.id));
                    return next;
                  })
                }
                aria-label="Select all visible contacts"
              />
            </label>
            <span>Contact</span>
            <span>Phone</span>
            <span>Source</span>
            <span>Added</span>
            <span />
          </div>
          {loading ? (
            <div className="empty-state">Loading contacts…</div>
          ) : filtered.length ? (
            filtered.map((item) => (
              <div className="contacts-row" key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    aria-label={`Select ${item.name || item.phone}`}
                  />
                </label>
                <div className="contact-identity">
                  {item.avatarUrl ? <img className="contact-avatar" src={item.avatarUrl} alt="" /> : <span><UserRound size={16} /></span>}
                  <div>
                    <strong>{item.name || "Unnamed contact"}</strong>
                    <small>{item.email || "No email address"}</small>
                  </div>
                </div>
                <span>{item.phone}</span>
                <span className="contact-source">
                  {item.source || "manual"}
                </span>
                <time>{new Date(item.createdAt).toLocaleDateString()}</time>
                <button
                  className="icon-button danger-icon"
                  onClick={() => void remove([item.id])}
                  aria-label={`Delete ${item.name || item.phone}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state">No contacts match your search.</div>
          )}
        </div>
      </Panel>

      {showCreate && (
        <div className="modal-backdrop">
          <section className="resource-modal" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">New contact</span>
                <h2>Add someone manually</h2>
                <p>The phone number must include its country code.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                <X />
              </button>
            </div>
            <form className="resource-form modal-form" onSubmit={create}>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Phone
                <input name="phone" placeholder="+201234567890" required />
              </label>
              <label>
                Email
                <input name="email" type="email" />
              </label>
              <label>
                Notes
                <textarea name="notes" />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button className="primary-button">Add contact</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

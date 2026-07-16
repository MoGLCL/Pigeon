"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type Entry = {
  label: string;
  group: string;
  secret: boolean;
  configured: boolean;
  value: string;
  hint?: string;
};
const callbackKeys = new Set([
  "FACEBOOK_CALLBACK_MODE",
  "FACEBOOK_CALLBACK_URL",
]);

export function RuntimeConfigForm() {
  const [data, setData] = useState<Record<string, Entry>>({}),
    [values, setValues] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [origin, setOrigin] = useState("");
  async function load() {
    const response = await fetch("/api/admin/config", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as Record<string, Entry>;
    setData(body);
    setValues(
      Object.fromEntries(
        Object.entries(body).map(([key, item]) => [
          key,
          item.secret ? "" : item.value,
        ]),
      ),
    );
  }
  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);
  const groups = useMemo(
    () =>
      Object.entries(data).reduce<Record<string, [string, Entry][]>>(
        (all, entry) => {
          (all[entry[1].group] ??= []).push(entry);
          return all;
        },
        {},
      ),
    [data],
  );
  const automatic = (values.FACEBOOK_CALLBACK_MODE || "auto") !== "manual";
  let automaticUrl = "";
  try {
    automaticUrl = new URL(
      "/api/facebook/oauth/callback",
      values.APP_URL || origin,
    ).toString();
  } catch {
    automaticUrl = "Set a valid Public application URL first";
  }
  const effectiveCallback = automatic
    ? automaticUrl
    : values.FACEBOOK_CALLBACK_URL || "";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await response.json().catch(() => ({}));
    setMessage(
      response.ok
        ? "Runtime configuration saved. New Facebook connections will use this callback immediately."
        : body.error || "Unable to save configuration.",
    );
    setSaving(false);
    if (response.ok) await load();
  }
  return (
    <form className="runtime-config" onSubmit={submit}>
      <div className="config-notice">
        <ShieldCheck />
        <div>
          <strong>Database-backed runtime configuration</strong>
          <p>
            Automatic server defaults are saved to the database. Owner changes
            override deployment fallbacks.
          </p>
        </div>
      </div>
      {Object.entries(groups).map(([group, entries]) => (
        <section className="config-section" key={group}>
          <div className="config-section-heading">
            <div>
              <h2>{group}</h2>
              {group === "Facebook" ? (
                <a
                  className="config-doc-link"
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Meta for Developers <ExternalLink size={14} />
                </a>
              ) : group === "OpenWA" ? (
                <a
                  className="config-doc-link"
                  href="https://docs.openwa.dev/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Official OpenWA documentation <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
            <span>
              {entries.filter(([, item]) => item.configured).length}/
              {entries.length} configured
            </span>
          </div>
          {group === "Facebook" ? (
            <div className="facebook-callback-control">
              <div className="callback-control-heading">
                <div>
                  <strong>Facebook OAuth callback</strong>
                  <p>
                    Automatic builds the callback from the public application
                    URL. Turn it off to enter the complete callback manually.
                  </p>
                </div>
                <label className="switch-field">
                  <input
                    type="checkbox"
                    checked={automatic}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        FACEBOOK_CALLBACK_MODE: event.target.checked
                          ? "auto"
                          : "manual",
                      }))
                    }
                  />
                  <span>Automatic</span>
                </label>
              </div>
              {!automatic ? (
                <label>
                  <span>Manual callback URL</span>
                  <div className="config-input">
                    <input
                      type="url"
                      value={values.FACEBOOK_CALLBACK_URL || ""}
                      placeholder="https://example.com/api/facebook/oauth/callback"
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          FACEBOOK_CALLBACK_URL: event.target.value,
                        }))
                      }
                    />
                  </div>
                </label>
              ) : null}
              <div className="callback-preview">
                <div>
                  <small>Callback URL to add in Meta</small>
                  <code>{effectiveCallback || "Configure the URL first"}</code>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    void navigator.clipboard.writeText(effectiveCallback)
                  }
                  disabled={!effectiveCallback}
                  aria-label="Copy callback URL"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
          ) : null}
          <div className="config-grid">
            {entries
              .filter(([key]) => !callbackKeys.has(key))
              .map(([key, item]) => (
                <label key={key}>
                  <span>
                    {item.secret ? (
                      <KeyRound size={15} />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}{" "}
                    {item.label}
                  </span>
                  <div className="config-input">
                    {key === "OPENWA_AUTO_START" ? (
                      <select
                        value={values[key] || "true"}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    ) : (
                      <input
                        type={
                          item.secret
                            ? "password"
                            : key === "OPENWA_PORT"
                              ? "number"
                              : key === "APP_URL" || key.endsWith("_URL")
                                ? "url"
                                : "text"
                        }
                        min={key === "OPENWA_PORT" ? 1 : undefined}
                        max={key === "OPENWA_PORT" ? 65535 : undefined}
                        value={values[key] ?? ""}
                        placeholder={
                          item.secret && item.configured
                            ? "Configured — enter to replace"
                            : "Not configured"
                        }
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    )}{" "}
                    {item.configured ? <b>Configured</b> : null}
                  </div>
                  {item.hint ? <small>{item.hint}</small> : null}
                </label>
              ))}
          </div>
        </section>
      ))}
      <div className="config-actions">
        <p role="status">{message}</p>
        <button className="primary-button" disabled={saving}>
          <RefreshCw size={16} />
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </form>
  );
}

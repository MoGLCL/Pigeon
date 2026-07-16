"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Laptop, LogOut, MonitorSmartphone, Smartphone } from "lucide-react";
import { PasswordConfirmDialog } from "@/components/ui/PasswordConfirmDialog";

type Profile = { name: string; username: string; email: string };
type Tab = "profile" | "security" | "preferences" | "activity";
type Login = {
  id: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
  current: boolean;
  type: string;
  browser: string;
  os: string;
};
type ActivityData = {
  verificationExpiresAt?: number | null;
  activeSessions: number;
  logins: Login[];
  activity: {
    id: string;
    action: string;
    createdAt: string;
    ipAddress?: string;
    details?: unknown;
  }[];
  olderNotifications: {
    id: string;
    title: string;
    body?: string;
    createdAt: string;
  }[];
};

const tabs: Tab[] = ["profile", "security", "preferences", "activity"];

export function SettingsHub() {
  const [active, setActive] = useState<Tab>("profile");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "tab",
    ) as Tab | null;
    if (requested && tabs.includes(requested)) setActive(requested);
  }, []);

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={active === tab ? "active" : ""}
            onClick={() => setActive(tab)}
          >
            {title(tab)}
          </button>
        ))}
      </nav>
      <section className="settings-content">
        {active === "profile" ? (
          <ProfileSettings />
        ) : active === "security" ? (
          <SecuritySettings />
        ) : active === "preferences" ? (
          <PreferencesSettings />
        ) : (
          <ActivityLog />
        )}
      </section>
    </div>
  );
}

function ProfileSettings() {
  const [profile, setProfile] = useState<Profile>({
    name: "",
    username: "",
    email: "",
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.json())
      .then((data) =>
        setProfile({
          name: data.name || "",
          username: data.username || "",
          email: data.email || "",
        }),
      );
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    });
    const body = await response.json();
    if (response.ok) {
      setProfile({
        name: body.name,
        username: body.username,
        email: body.email,
      });
      setMessage("Profile saved");
      window.dispatchEvent(new Event("pigeon:profile-updated"));
    } else setMessage(body.error);
  }

  return (
    <SettingsSection
      title="Your profile"
      description="Update the identity used across your workspace."
    >
      <form className="settings-form settings-form-wide" onSubmit={submit}>
        <label>
          Full name
          <input
            value={profile.name}
            onChange={(event) =>
              setProfile((value) => ({ ...value, name: event.target.value }))
            }
            required
          />
        </label>
        <label>
          Username
          <div className="input-prefix">
            <span>@</span>
            <input
              value={profile.username}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  username: event.target.value,
                }))
              }
              required
            />
          </div>
        </label>
        <label>
          Email address
          <input
            type="email"
            value={profile.email}
            onChange={(event) =>
              setProfile((value) => ({ ...value, email: event.target.value }))
            }
            required
          />
        </label>
        <button className="primary-button">Save profile</button>
        {message && <p className="settings-message">{message}</p>}
      </form>
    </SettingsSection>
  );
}

function SecuritySettings() {
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) {
      setMessage("New passwords do not match");
      return;
    }
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "password",
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    });
    const body = await response.json();
    setMessage(
      response.ok
        ? "Password updated. Other sessions were signed out."
        : body.error,
    );
    if (response.ok) form.reset();
  }
  return (
    <SettingsSection
      title="Password & security"
      description="Use a strong password you do not reuse elsewhere."
    >
      <form className="settings-form settings-form-wide" onSubmit={submit}>
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </label>
        <button className="primary-button">Reset password</button>
        {message && <p className="settings-message">{message}</p>}
      </form>
    </SettingsSection>
  );
}

function PreferencesSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setEnabled(data.auto_add_whatsapp_contacts === "true");
        setLoaded(true);
      });
  }, []);

  async function save(next: boolean) {
    setEnabled(next);
    setMessage("");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auto_add_whatsapp_contacts: String(next) }),
    });
    if (!response.ok) {
      setEnabled(!next);
      setMessage(
        (await response.json()).error || "Preference could not be saved",
      );
      return;
    }
    setMessage("Preference saved");
  }

  return (
    <SettingsSection
      title="Contact preferences"
      description="Choose how new WhatsApp conversations affect your contact book."
    >
      <div className="preference-card">
        <div>
          <strong>Automatically add new WhatsApp contacts</strong>
          <p>
            When enabled, a person is added only when they send a new message
            after the WhatsApp account was connected. Previous chat history is
            never imported as contacts.
          </p>
        </div>
        <label className="switch-control">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!loaded}
            onChange={(event) => void save(event.target.checked)}
          />
          <span aria-hidden="true" />
          <b>{enabled ? "On" : "Off"}</b>
        </label>
      </div>
      {message && <p className="settings-message">{message}</p>}
    </SettingsSection>
  );
}

function ActivityLog() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [view, setView] = useState<"sessions" | "history">("sessions");
  const [verifiedUntil, setVerifiedUntil] = useState(0);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<Login | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const load = useCallback(() => {
    fetch("/api/activity", { cache: "no-store" })
      .then((response) => response.json())
      .then((next: ActivityData) => {
        setData(next);
        setVerifiedUntil(next.verificationExpiresAt || 0);
      });
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => {
    const clearVerification = () => {
      void fetch("/api/activity/verification", {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", clearVerification);
    return () => {
      window.removeEventListener("pagehide", clearVerification);
      clearVerification();
    };
  }, []);

  async function disconnect(password: string, session: Login | null = target) {
    if (!session || disconnecting) return;
    setDisconnecting(true);
    setDialogError("");
    const response = await fetch(`/api/activity/sessions/${session.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(password ? { password } : {}),
    });
    const body = await response.json().catch(() => ({}));
    setDisconnecting(false);
    if (!response.ok) {
      if (!password && response.status === 422) {
        setTarget(session);
        setVerifiedUntil(0);
        return;
      }
      setDialogError(body.error || "Session could not be disconnected");
      return;
    }
    setVerifiedUntil(Number(body.verificationExpiresAt) || verifiedUntil);
    setMessage("Device disconnected");
    setTarget(null);
    load();
  }

  function requestDisconnect(session: Login) {
    setDialogError("");
    if (verifiedUntil > Date.now()) void disconnect("", session);
    else setTarget(session);
  }

  return (
    <SettingsSection
      title="Devices & activity"
      description="See every live session, identify this device and disconnect access you no longer recognize."
    >
      {!data ? (
        <p className="settings-message">Loading activity…</p>
      ) : (
        <div className="activity-sections">
          <div className="activity-tabs" role="tablist" aria-label="Activity views">
            <button type="button" role="tab" aria-selected={view === "sessions"} className={view === "sessions" ? "active" : ""} onClick={() => setView("sessions")}>
              <MonitorSmartphone size={17} /> Sessions
            </button>
            <button type="button" role="tab" aria-selected={view === "history"} className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
              <History size={17} /> History log
            </button>
          </div>
          {view === "sessions" ? <>
          <div className="activity-summary">
            <MonitorSmartphone size={20} />
            <strong>{data.activeSessions}</strong>
            <span>active session{data.activeSessions === 1 ? "" : "s"}</span>
            {verifiedUntil > Date.now() ? <small>Password verified for this visit</small> : null}
          </div>
          <div className="active-devices">
            <h3>Active devices</h3>
            {data.logins
              .filter((item) => item.active)
              .map((item) => (
                <article
                  key={item.id}
                  className={item.current ? "is-current" : ""}
                >
                  <span className="device-icon">
                    {item.type === "Mobile" ? <Smartphone /> : <Laptop />}
                  </span>
                  <div>
                    <strong>
                      {item.browser} on {item.os}
                    </strong>
                    <small>
                      {item.ipAddress} · Started{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </small>
                    <small>
                      Expires {new Date(item.expiresAt).toLocaleString()}
                    </small>
                  </div>
                  {item.current ? (
                    <span className="current-session-badge">This session</span>
                  ) : (
                    <button
                      className="secondary-button compact danger-button"
                      disabled={disconnecting}
                      onClick={() => requestDisconnect(item)}
                    >
                      <LogOut size={15} />
                      Disconnect
                    </button>
                  )}
                </article>
              ))}
          </div>
          </> : null}
          {message && <p className="settings-message">{message}</p>}
          {view === "history" ? <div className="activity-history-panel">
          <ActivityList
            title="Login history"
            items={data.logins.map((item) => ({
              id: item.id,
              title: `${item.type} · ${item.browser} · ${item.os}`,
              detail: `${item.ipAddress} · ${item.active ? "Active" : "Expired"}`,
              createdAt: item.createdAt,
            }))}
          />
          <ActivityList
            title="Account activity"
            items={data.activity.map((item) => ({
              id: item.id,
              title: item.action.replaceAll(".", " "),
              detail: item.ipAddress || "Account action",
              createdAt: item.createdAt,
            }))}
          />
          <ActivityList
            title="Older notifications"
            items={data.olderNotifications.map((item) => ({
              id: item.id,
              title: item.title,
              detail: item.body || "Notification",
              createdAt: item.createdAt,
            }))}
          />
          </div> : null}
        </div>
      )}
      <PasswordConfirmDialog
        open={Boolean(target)}
        deviceName={target ? `${target.browser} on ${target.os}` : "this device"}
        busy={disconnecting}
        error={dialogError}
        onCancel={() => { if (!disconnecting) { setTarget(null); setDialogError(""); } }}
        onConfirm={(password) => disconnect(password)}
      />
    </SettingsSection>
  );
}

function ActivityList({
  title: heading,
  items,
}: {
  title: string;
  items: { id: string; title: string; detail: string; createdAt: string }[];
}) {
  return (
    <div className="activity-group">
      <h3>{heading}</h3>
      {items.length ? (
        <div className="activity-list">
          {items.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
              <time>{new Date(item.createdAt).toLocaleString()}</time>
            </article>
          ))}
        </div>
      ) : (
        <p className="settings-message">No activity yet.</p>
      )}
    </div>
  );
}

function SettingsSection({
  title: heading,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-section">
      <div className="settings-heading">
        <h2>{heading}</h2>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

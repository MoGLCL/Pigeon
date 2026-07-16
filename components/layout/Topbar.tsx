"use client";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { MobileMenuButton } from "./Sidebar";
import { Brand } from "@/components/brand/Brand";
import {
  currentUser,
  refreshCurrentUser,
  type CurrentUser,
} from "@/lib/client/current-user";
import { useAutoRefresh } from "@/lib/client/use-auto-refresh";
type Notice = {
  id: string;
  title: string;
  body?: string;
  isRead: boolean;
  metadata?: { href?: string };
  createdAt: string;
};
type Change = {
  id: string;
  version: string;
  title: string;
  body: string;
  seenBy: { seenAt: string }[];
};
type Announcement = {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  seenBy: { seenAt: string }[];
};
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const [user, setUser] = useState<CurrentUser | null>(null),
    [notifications, setNotifications] = useState<Notice[]>([]),
    [notificationLimit, setNotificationLimit] = useState(5),
    [changes, setChanges] = useState<Change[]>([]),
    [announcements, setAnnouncements] = useState<Announcement[]>([]),
    [noticeOpen, setNoticeOpen] = useState(false),
    [changesOpen, setChangesOpen] = useState(false),
    [announcementsOpen, setAnnouncementsOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const load = async () => {
    const [me, n, c, a] = await Promise.all([
      currentUser(),
      fetch(`/api/notifications?limit=${notificationLimit}`, {
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/changelog", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch("/api/announcements", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : [],
      ),
    ]);
    setUser(me);
    setNotifications(n);
    setChanges(c);
    setAnnouncements(a);
  };
  useEffect(() => {
    void load();
    const updated = () => void refreshCurrentUser().then(setUser);
    const outside = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      )
        setProfileOpen(false);
    };
    window.addEventListener("pigeon:profile-updated", updated);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("pigeon:profile-updated", updated);
      document.removeEventListener("mousedown", outside);
    };
  }, [notificationLimit]);
  useAutoRefresh(load);
  const unseenChanges = changes.filter((x) => x.seenBy.length === 0),
    unread = notifications.filter((item) => !item.isRead),
    unseenAnnouncements = announcements.filter(
      (item) => item.seenBy.length === 0,
    );
  const announcementTone = (
    unseenAnnouncements.find((item) => item.type === "warning") ||
    unseenAnnouncements.find((item) => item.type === "success") ||
    unseenAnnouncements.find((item) => item.type === "info")
  )?.type;
  function closeOthers() {
    setNoticeOpen(false);
    setChangesOpen(false);
    setAnnouncementsOpen(false);
  }
  async function openChanges() {
    const opening = !changesOpen;
    closeOthers();
    setChangesOpen(opening);
    if (opening && unseenChanges.length) {
      await Promise.all(
        unseenChanges.map((x) =>
          fetch(`/api/changelog/${x.id}/seen`, { method: "POST" }),
        ),
      );
      setChanges((list) =>
        list.map((x) => ({
          ...x,
          seenBy: [{ seenAt: new Date().toISOString() }],
        })),
      );
    }
  }
  async function openNotifications() {
    const opening = !noticeOpen;
    closeOthers();
    setNoticeOpen(opening);
    if (opening && unread.length) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: unread.map((item) => item.id),
          isRead: true,
        }),
      });
      setNotifications((list) =>
        list.map((item) => ({ ...item, isRead: true })),
      );
    }
  }
  async function openAnnouncements() {
    const opening = !announcementsOpen;
    closeOthers();
    setAnnouncementsOpen(opening);
    if (opening && unseenAnnouncements.length) {
      await Promise.all(
        unseenAnnouncements.map((item) =>
          fetch(`/api/announcements/${item.id}/seen`, { method: "POST" }),
        ),
      );
      setAnnouncements((list) =>
        list.map((item) => ({
          ...item,
          seenBy: [{ seenAt: new Date().toISOString() }],
        })),
      );
    }
  }
  const adminHref = user?.role === "moderator" ? "/admin/reports" : "/admin";
  return (
    <header className="topbar">
      <div className="topbar-title">
        <MobileMenuButton onClick={onMenu} />
        <Brand className="topbar-brand" />
      </div>
      <div className="topbar-actions">
        <Popover
          label="Announcements"
          tone={announcementTone}
          icon={<Megaphone size={19} />}
          count={unseenAnnouncements.length}
          open={announcementsOpen}
          onClick={openAnnouncements}
        >
          {announcements.length ? (
            announcements.map((item) => (
              <article
                className={`announcement-item is-${item.type}`}
                key={item.id}
              >
                <b>{item.title}</b>
                <p>{item.body}</p>
                <small>{new Date(item.createdAt).toLocaleDateString()}</small>
              </article>
            ))
          ) : (
            <p>No announcements yet</p>
          )}
        </Popover>
        <Popover
          label="What’s new"
          icon={<Sparkles size={19} />}
          count={unseenChanges.length}
          open={changesOpen}
          onClick={() => void openChanges()}
        >
          {changes.length ? (
            changes.slice(0, 6).map((x) => (
              <article key={x.id}>
                <small>v{x.version}</small>
                <b>{x.title}</b>
                <p>{x.body}</p>
              </article>
            ))
          ) : (
            <p>No updates yet</p>
          )}
        </Popover>
        <Popover
          label="Notifications"
          icon={<Bell size={20} />}
          count={unread.length}
          open={noticeOpen}
          onClick={() => void openNotifications()}
        >
          {notifications.length ? (
            notifications.map((item) => (
              <Link
                href={item.metadata?.href || "#"}
                key={item.id}
                onClick={() => setNoticeOpen(false)}
              >
                <b>{item.title}</b>
                {item.body ? <small>{item.body}</small> : null}
              </Link>
            ))
          ) : (
            <p>No notifications yet</p>
          )}
          {notificationLimit < 20 &&
          notifications.length >= notificationLimit ? (
            <button
              className="notification-more"
              onClick={() => setNotificationLimit(20)}
            >
              Show more
            </button>
          ) : null}
          <Link
            className="notification-activity-link"
            href="/settings?tab=activity"
          >
            View activity log
          </Link>
        </Popover>
        <div className="profile-menu-wrap" ref={profileRef}>
          <button
            className="profile profile-trigger"
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
          >
            <span className="avatar">
              {user?.name
                ?.split(" ")
                .map((x) => x[0])
                .join("")
                .slice(0, 2) || "P"}
            </span>
            <span className="profile-copy">
              <strong>{user?.name || user?.username || "Pigeon user"}</strong>
              <small>@{user?.username || "user"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {profileOpen && (
            <div className="profile-menu">
              {user?.role !== "user" && (
                <Link href={adminHref}>
                  <ShieldCheck size={17} />
                  Admin Panel
                </Link>
              )}
              <div className="profile-username">
                <UserRound size={17} />
                <span>
                  <small>Username</small>
                  <strong>@{user?.username}</strong>
                </span>
              </div>
              <Link href="/settings?tab=profile">
                <Settings size={17} />
                Profile settings
              </Link>
              <button onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut size={17} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
function Popover({
  label,
  icon,
  count,
  open,
  onClick,
  children,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="notification-wrap">
      <button
        className={`icon-button notification${tone ? ` is-announcement-${tone}` : ""}`}
        aria-label={label}
        aria-expanded={open}
        onClick={onClick}
      >
        {icon}
        {count > 0 && <span>{count}</span>}
      </button>
      {open && (
        <div className="notification-popover notification-list">
          <strong>{label}</strong>
          {children}
        </div>
      )}
    </div>
  );
}

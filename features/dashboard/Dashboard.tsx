"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CalendarDays, ChevronRight } from "lucide-react";
import { FaFacebookF, FaWhatsapp } from "react-icons/fa";
import { formatDistanceToNow } from "date-fns";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Panel } from "@/components/ui/Panel";
import { ActivityChart } from "./ActivityChart";
import { ChannelInsights } from "./ChannelInsights";
import { dashboardStats } from "./dashboard.data";
import { cn } from "@/lib/cn";
import { useAutoRefresh } from "@/lib/client/use-auto-refresh";
type DashboardData = {
  user: { name?: string; username: string; role: string; createdAt?: string };
  range?: { start: string; end: string; maxDays: number; bucketDays: number };
  stats: Record<"total" | "delivered" | "replies" | "contacts", number>;
  activity: { labels: string[]; facebook: number[]; whatsapp: number[] };
  channels: {
    id: string;
    name: string;
    handle: string;
    status: string;
    tone: string;
  }[];
  conversations: {
    id: string;
    name: string;
    message: string;
    accountName: string;
    time?: string;
    channel: string;
    unread: number;
    avatarUrl?: string;
  }[];
  analytics: {
    channels: { key: string; label: string; count: number; percent: number }[];
    topContacts: { id: string; name: string; avatarUrl?: string; channel: string; messages: number }[];
    sourcePosts: { id: string; title: string; page: string; engagement: number; comments: number }[];
    totalActivity: number;
  };
  scheduled: {
    id: string;
    title: string;
    type: string;
    date?: string;
    channel: string;
  }[];
  insights: {
    unread: number;
    activeAutomations: number;
    openTickets: number;
    scheduled: number;
  };
  announcement: { title: string; body: string } | null;
};
const emptyData: DashboardData = {
  user: { username: "", role: "" },
  stats: { total: 0, delivered: 0, replies: 0, contacts: 0 },
  activity: { labels: [], facebook: [], whatsapp: [] },
  channels: [],
  conversations: [],
  scheduled: [],
  insights: { unread: 0, activeAutomations: 0, openTickets: 0, scheduled: 0 },
  announcement: null,
  analytics: { channels: [], topContacts: [], sourcePosts: [], totalActivity: 0 },
};
const dateValue = (date: Date) => date.toISOString().slice(0, 10);
const today = dateValue(new Date());
const initialStart = dateValue(new Date(Date.now() - 6 * 86400000));
export function Dashboard() {
  const [navOpen, setNavOpen] = useState(false);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(today);
  const [dateError, setDateError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const load = async () => {
    const response = await fetch(`/api/dashboard?start=${start}&end=${end}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const body = await response.json();
      setData(body);
      setStart(dateValue(new Date(body.range.start)));
      setEnd(dateValue(new Date(body.range.end)));
      setDateError("");
    } else setDateError((await response.json()).error);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  useAutoRefresh(load);
  useGSAP(
    () => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        gsap.from("[data-reveal]", {
          autoAlpha: 0,
          y: 12,
          duration: 0.35,
          stagger: 0.03,
          ease: "power2.out",
          clearProps: "all",
        });
    },
    { scope: root },
  );
  const displayName = data.user.name?.trim() || data.user.username || "there";
  const minDate = data.user.createdAt
    ? dateValue(new Date(data.user.createdAt))
    : "";
  function filter(event: React.FormEvent) {
    event.preventDefault();
    const days =
      (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1;
    if (days > 90)
      return setDateError("The selected period cannot exceed 90 days.");
    void load();
  }
  return (
    <div className="app-shell" ref={root}>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="app-main">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="dashboard">
          <div className="welcome-row" data-reveal>
            <div>
              <h1>Welcome back, {displayName}</h1>
              <p>Your live communication activity across connected channels.</p>
            </div>
            <form className="date-range" onSubmit={filter}>
              <CalendarDays size={17} />
              <label>
                From
                <input
                  type="date"
                  value={start}
                  min={minDate}
                  max={end}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={end}
                  min={start}
                  max={today}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <button className="secondary-button">Apply</button>
            </form>
          </div>
          {dateError && <p className="form-error date-error">{dateError}</p>}
          <div className="stats-grid">
            {dashboardStats.map(({ key, label, icon: Icon }) => (
              <Panel className="stat-card" key={key} data-reveal>
                <div className="stat-icon">
                  <Icon size={21} />
                </div>
                <div>
                  <p>{label}</p>
                  <strong>
                    {loading ? "—" : data.stats[key].toLocaleString()}
                  </strong>
                </div>
                <span className="change">Live</span>
                <small>selected period</small>
              </Panel>
            ))}
          </div>
          <div className="dashboard-insights" data-reveal>
            <div>
              <span>Unread conversations</span>
              <strong>{data.insights.unread}</strong>
            </div>
            <div>
              <span>Active automations</span>
              <strong>{data.insights.activeAutomations}</strong>
            </div>
            <div>
              <span>Open support tickets</span>
              <strong>{data.insights.openTickets}</strong>
            </div>
            <div>
              <span>Scheduled actions</span>
              <strong>{data.insights.scheduled}</strong>
            </div>
          </div>
          <div className="content-grid">
            <div className="left-column">
              <Panel data-reveal>
                <PanelHeader title="Message activity" />
                <ActivityChart series={data.activity} />
              </Panel>
              <ChannelInsights analytics={data.analytics} />
              <Panel data-reveal>
                <PanelHeader title="Scheduled activity" />
                <div className="schedule-list">
                  {data.scheduled.length ? (
                    data.scheduled.map((item) => (
                      <Link
                        className="schedule-row interactive-row"
                        href={
                          item.channel === "facebook"
                            ? "/facebook"
                            : "/broadcast"
                        }
                        key={item.id}
                      >
                        <ChannelIcon channel={item.channel} />
                        <div className="grow">
                          <strong>{item.title}</strong>
                          <small>{item.type}</small>
                        </div>
                        <span className="schedule-date">
                          {item.date
                            ? new Date(item.date).toLocaleString()
                            : "—"}
                        </span>
                        <span className="status">Scheduled</span>
                      </Link>
                    ))
                  ) : (
                    <EmptyState text="Nothing scheduled yet" />
                  )}
                </div>
              </Panel>
            </div>
            <div className="right-column">
              <Panel data-reveal>
                <PanelHeader title="Channel health" />
                <div className="channel-list">
                  {data.channels.length ? (
                    data.channels.map((channel) => (
                      <Link
                        className="channel-row interactive-row"
                        href={
                          channel.tone === "facebook"
                            ? "/facebook"
                            : "/whatsapp"
                        }
                        key={channel.id}
                      >
                        <ChannelIcon channel={channel.tone} />
                        <div className="grow">
                          <strong>{channel.name}</strong>
                          <small>{channel.handle}</small>
                        </div>
                        <span
                          className={cn(
                            "connection-state",
                            channel.status.toLowerCase().includes("connect") &&
                              "is-online",
                          )}
                        >
                          {channel.status}
                        </span>
                        <ChevronRight size={17} />
                      </Link>
                    ))
                  ) : (
                    <EmptyState text="Connect Facebook or WhatsApp to see channel health" />
                  )}
                </div>
              </Panel>
              <Panel data-reveal>
                <PanelHeader title="Recent conversations" />
                <div className="conversation-list">
                  {data.conversations.length ? (
                    data.conversations.map((item) => (
                      <Link
                        className="conversation-row interactive-row"
                        href={
                          item.channel === "facebook"
                            ? `/messenger?conversation=${item.id}`
                            : `/whatsapp/chat/${item.id}`
                        }
                        key={`${item.channel}-${item.id}`}
                      >
                        {item.avatarUrl ? <img className="conversation-avatar small-avatar" src={item.avatarUrl} alt="" /> : <span className="avatar small-avatar">{initials(item.name)}</span>}
                        <ChannelIcon channel={item.channel} small />
                        <div className="grow">
                          <strong>{item.name}</strong>
                          <small>
                            {item.message} · via {item.accountName}
                          </small>
                        </div>
                        <time>
                          {item.time
                            ? formatDistanceToNow(new Date(item.time), {
                                addSuffix: true,
                              })
                            : ""}
                        </time>
                        {item.unread > 0 && (
                          <b className="unread">{item.unread}</b>
                        )}
                      </Link>
                    ))
                  ) : (
                    <EmptyState text="No conversations yet" />
                  )}
                </div>
              </Panel>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
function PanelHeader({ title }: { title: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return <div className="dashboard-empty">{text}</div>;
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function ChannelIcon({
  channel,
  small = false,
}: {
  channel: string;
  small?: boolean;
}) {
  const Icon = channel === "facebook" ? FaFacebookF : FaWhatsapp;
  return (
    <span className={cn("channel-icon", `is-${channel}`, small && "small")}>
      <Icon size={small ? 10 : 19} />
    </span>
  );
}

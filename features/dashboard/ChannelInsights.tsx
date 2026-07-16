import Link from "next/link";
import { FaFacebookF, FaFacebookMessenger, FaWhatsapp } from "react-icons/fa";
import { Panel } from "@/components/ui/Panel";

type Analytics = {
  channels: { key: string; label: string; count: number; percent: number }[];
  topContacts: { id: string; name: string; avatarUrl?: string; channel: string; messages: number }[];
  sourcePosts: { id: string; title: string; page: string; engagement: number; comments: number }[];
  totalActivity: number;
};

export function ChannelInsights({ analytics }: { analytics: Analytics }) {
  const maxContact = Math.max(1, ...analytics.topContacts.map((item) => item.messages));
  return (
    <Panel className="channel-analytics" data-reveal>
      <div className="panel-header"><div><h2>Channel performance</h2><p>Percentages show each channel&apos;s share of recorded activity in the selected period.</p></div><strong>{analytics.totalActivity.toLocaleString()} events</strong></div>
      <div className="channel-share" role="img" aria-label={analytics.channels.map((item) => `${item.label} ${item.percent}%`).join(", ")}>
        {analytics.channels.map((item) => <div className={`is-${item.key}`} key={item.key} style={{ width: `${item.percent}%` }} title={`${item.label}: ${item.count} (${item.percent}%)`} />)}
      </div>
      <div className="channel-share-legend">
        {analytics.channels.map((item) => <div key={item.key}><ChannelIcon channel={item.key}/><span><strong>{item.percent}%</strong><small>{item.label} · {item.count}</small></span></div>)}
      </div>
      <div className="analytics-columns">
        <section><h3>Top contacts</h3><p>Ranked by stored message count.</p><div className="rank-list">
          {analytics.topContacts.length ? analytics.topContacts.map((item) => <Link href={item.channel === "whatsapp" ? `/whatsapp/chat/${item.id}` : `/messenger?conversation=${item.id}`} key={`${item.channel}-${item.id}`}>
            {item.avatarUrl ? <img src={item.avatarUrl} alt=""/> : <span className="avatar">{item.name.slice(0, 2).toUpperCase()}</span>}
            <div><strong>{item.name}</strong><span><i style={{ width: `${Math.max(8, item.messages / maxContact * 100)}%` }}/></span></div><b>{item.messages}</b>
          </Link>) : <small>No contact activity in this period.</small>}
        </div></section>
        <section><h3>Facebook source posts</h3><p>Posts ranked by reactions, comments and shares—not website referrals.</p><div className="source-post-list">
          {analytics.sourcePosts.length ? analytics.sourcePosts.map((item, index) => <Link href="/facebook" key={item.id}><b>{index + 1}</b><div><strong>{item.title}</strong><small>{item.page} · {item.engagement} engagements · {item.comments} comments</small></div></Link>) : <small>No published Facebook posts in this period.</small>}
        </div></section>
      </div>
    </Panel>
  );
}
function ChannelIcon({ channel }: { channel: string }) {
  const Icon = channel === "whatsapp" ? FaWhatsapp : channel === "messenger" ? FaFacebookMessenger : FaFacebookF;
  return <span className={`channel-icon is-${channel}`}><Icon size={16}/></span>;
}

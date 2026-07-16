"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BarChart3, ExternalLink, Eye, LoaderCircle, MessageCircle, Plus, Send, Share2, ThumbsUp, Trash2, UsersRound, X } from "lucide-react";
import { FaFacebookF } from "react-icons/fa";
import { Panel } from "@/components/ui/Panel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Page = { id: string; pageId: string; name: string; avatarUrl?: string; status: string; grantedPermissions: string[]; followersCount?: number; lastSyncedAt?: string };
type Candidate = { pageId: string; name: string; avatarUrl?: string; grantedPermissions: string[] };
type Post = { id: string; content: string; status: string; reactions: number; commentsCount: number; shares: number; mediaUrls?: string[]; publishedAt?: string; createdAt: string };
type Comment = { id: string; authorName?: string; authorAvatarUrl?: string; content: string; status: string; reactions: number; postedAt: string; page: { id: string; name: string; avatarUrl?: string } };
type DataPoint = { label: string; value: number };
type PostDetails = {
  post: Post & { permalinkUrl?: string | null; page: Page };
  comments: Comment[];
  insights: { available: boolean; primary: { name: string; label: string; value: number | null } | null; metrics: { name: string; label: string; description: string; value: number | null }[]; error?: string | null };
  audience: { available: boolean; gender: DataPoint[]; ages: DataPoint[]; countries: DataPoint[]; error?: string | null };
  warnings: string[];
};

export function FacebookWorkspace() {
  const [pages, setPages] = useState<Page[]>([]), [candidates, setCandidates] = useState<Candidate[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]), [comments, setComments] = useState<Comment[]>([]), [pageId, setPageId] = useState("");
  const [showSelect, setShowSelect] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [deletePage, setDeletePage] = useState<Page | null>(null), [detailId, setDetailId] = useState(""), [detail, setDetail] = useState<PostDetails | null>(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/facebook/pages", { cache: "no-store" });
    const next = response.ok ? await response.json() : [];
    setPages(next);
    setPageId((current) => next.some((page: Page) => page.id === current) ? current : next[0]?.id || "");
  }, []);
  const loadCandidates = useCallback(async () => {
    const response = await fetch("/api/facebook/oauth/pages", { cache: "no-store" });
    if (!response.ok) return;
    const available = await response.json() as Candidate[];
    setCandidates(available); setSelected(available.map((page) => page.pageId));
    if (available.length) setShowSelect(true);
  }, []);
  const loadActivity = useCallback(async (id: string) => {
    const [postResponse, commentResponse] = await Promise.all([
      fetch(`/api/facebook/posts?pageId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch(`/api/facebook/comments?pageId=${encodeURIComponent(id)}`, { cache: "no-store" }),
    ]);
    if (postResponse.ok) setPosts(await postResponse.json());
    if (commentResponse.ok) setComments(await commentResponse.json());
  }, []);
  const loadDetails = useCallback(async (id: string) => {
    setDetailLoading(true); setDetailError("");
    const response = await fetch(`/api/facebook/posts/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    setDetailLoading(false);
    if (!response.ok) { setDetail(null); setDetailError(body.error || "Post details could not be loaded"); return; }
    setDetail(body);
  }, []);
  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("select") === "1") void loadCandidates();
    if (params.get("error") === "not-configured") setError("Facebook is not configured by the platform owner yet.");
  }, [load, loadCandidates]);
  useEffect(() => { if (pageId) void loadActivity(pageId); else { setPosts([]); setComments([]); } }, [pageId, loadActivity]);
  useEffect(() => {
    if (!detailId) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailId(""); };
    document.addEventListener("keydown", close); document.body.classList.add("modal-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("modal-open"); };
  }, [detailId]);

  async function openPost(id: string) { setDetailId(id); setDetail(null); await loadDetails(id); }
  async function addSelected() {
    setBusy(true); setError("");
    const response = await fetch("/api/facebook/oauth/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageIds: selected }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not connect the selected Pages");
    setShowSelect(false); window.history.replaceState({}, "", "/facebook");
    setNotice("Page connected. Posts and Messenger history were imported."); await load();
  }
  async function remove(page: Page) {
    setBusy(true);
    const response = await fetch("/api/facebook/pages", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageId: page.id, confirmation: "DELETE" }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not remove this Page");
    setDeletePage(null); setNotice(`${page.name} removed`); await load();
  }
  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form).entries()); setBusy(true);
    const response = await fetch("/api/facebook/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, pageId, mediaUrls: [], publishNow: data.publishNow === "on", scheduledAt: data.scheduledAt || undefined }) });
    setBusy(false); if (!response.ok) return setError("Post could not be saved");
    form.reset(); setNotice(data.publishNow ? "Post published" : "Post saved"); await loadActivity(pageId);
  }
  async function reply(commentId: string, message: string) {
    if (!message.trim()) return; setBusy(true);
    const response = await fetch(`/api/facebook/comments/${commentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reply", message }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(body.error || "Comment reply could not be sent"); throw new Error(body.error); }
    setNotice("Reply sent"); await loadActivity(pageId); if (detailId) await loadDetails(detailId);
  }
  return <>
    <header className="workspace-header"><div><h1>Facebook</h1><p>Publish, monitor engagement and reply to comments across connected Pages.</p></div><a className="primary-button compact facebook-connect" href="/api/facebook/oauth/start"><FaFacebookF/><Plus size={15}/>Add account</a></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-success" role="status">{notice}</p> : null}
    <Panel className="connections-panel"><div className="connection-card-grid">
      {pages.map((page) => { const missing = ["pages_read_user_content", "read_insights"].filter((permission) => !page.grantedPermissions.includes(permission)); return <article className="provider-card" key={page.id}>
        {page.avatarUrl ? <img className="provider-avatar" src={page.avatarUrl} alt=""/> : <span className="channel-icon is-facebook"><FaFacebookF/></span>}
        <div className="provider-card-copy"><strong>{page.name}</strong><small>{page.followersCount?.toLocaleString() || 0} followers{page.lastSyncedAt ? ` · synced ${formatDistanceToNow(new Date(page.lastSyncedAt), { addSuffix: true })}` : ""}</small>{missing.length ? <small className="provider-error">Reconnect to enable full history and Page insights ({missing.join(", ")}).</small> : null}</div>
        <span className={`provider-status is-${page.status}`}>{page.status}</span>
        {missing.length ? <a className="secondary-button compact" href="/api/facebook/oauth/start">Reconnect</a> : null}<button className="icon-action danger-icon" aria-label={`Delete ${page.name}`} title="Delete Page connection" onClick={() => setDeletePage(page)}><Trash2 size={16}/></button>
      </article>; })}
      {!pages.length ? <div className="connection-empty"><span className="channel-icon is-facebook"><FaFacebookF/></span><h2>No Facebook Pages connected</h2><p>Sign in with Facebook and choose the Pages you want to manage.</p><a className="oauth-button facebook-button" href="/api/facebook/oauth/start"><FaFacebookF/>Connect with Facebook</a></div> : null}
    </div></Panel>
    {pages.length ? <>
      <div className="facebook-toolbar"><label>Viewing Page<select value={pageId} onChange={(event) => setPageId(event.target.value)}>{pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label></div>
      <div className="facebook-grid"><Panel className="facebook-composer"><h2>Create a post</h2><form className="resource-form single" onSubmit={publish}><label>Post content<textarea name="content" required/></label><label>Schedule<input name="scheduledAt" type="datetime-local"/></label><label className="checkbox-row"><input name="publishNow" type="checkbox"/> Publish now</label><button className="primary-button" disabled={busy}>Save post</button></form></Panel>
      <Panel className="facebook-posts"><div className="panel-header"><div><h2>Recent posts</h2><p>Select a post to inspect its engagement and audience.</p></div><BarChart3/></div><div className="post-feed">{posts.length ? posts.map((post) => <button type="button" className="post-card-button" key={post.id} onClick={() => void openPost(post.id)}><span className="post-card-copy">{post.mediaUrls?.[0] ? <img src={post.mediaUrls[0]} alt=""/> : null}<span><strong>{post.content}</strong><small>{post.status} · {formatDistanceToNow(new Date(post.publishedAt || post.createdAt), { addSuffix: true })}</small></span></span><span className="engagement-row"><span><ThumbsUp size={14}/>{post.reactions}</span><span><MessageCircle size={14}/>{post.commentsCount}</span><span><Share2 size={14}/>{post.shares}</span><span className="inspect-post">View details</span></span></button>) : <p className="muted-copy">No posts found for this Page.</p>}</div></Panel></div>
      <Panel className="facebook-comments"><div className="panel-header"><div><h2>Recent comments</h2><p>Reply from the Page that received each comment.</p></div></div><div className="comment-feed">{comments.length ? comments.map((comment) => <CommentRow key={comment.id} comment={comment} busy={busy} onReply={reply}/>) : <p className="muted-copy">No comments yet.</p>}</div></Panel>
    </> : null}
    <ConfirmDialog open={Boolean(deletePage)} title="Delete Facebook Page connection?" description={deletePage ? `This permanently removes ${deletePage.name}, its imported posts, comments and Messenger conversations from your workspace.` : ""} confirmLabel="Delete Page" requireText="DELETE" busy={busy} onCancel={() => setDeletePage(null)} onConfirm={() => deletePage ? remove(deletePage) : undefined}/>
    {showSelect ? <div className="modal-backdrop"><section className="resource-modal connect-modal" role="dialog" aria-modal="true" aria-labelledby="fb-select-title"><div className="modal-heading"><div><h2 id="fb-select-title">Choose your Pages</h2><p>Select one or more Pages to add to this workspace. Existing posts and Messenger chats will be imported.</p></div><button className="icon-button" onClick={() => setShowSelect(false)} aria-label="Close"><X/></button></div><div className="facebook-page-picker">{candidates.map((page) => <label key={page.pageId}><input type="checkbox" checked={selected.includes(page.pageId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, page.pageId] : current.filter((id) => id !== page.pageId))}/>{page.avatarUrl ? <img src={page.avatarUrl} alt=""/> : <span className="channel-icon is-facebook"><FaFacebookF/></span>}<span><strong>{page.name}</strong><small>Facebook Page</small></span></label>)}</div>{error ? <p className="form-error">{error}</p> : null}<div className="modal-actions"><button className="secondary-button" onClick={() => setShowSelect(false)}>Cancel</button><button className="primary-button" disabled={busy || !selected.length} onClick={() => void addSelected()}>{busy ? "Connecting and importing…" : `Add ${selected.length} Page${selected.length === 1 ? "" : "s"}`}</button></div></section></div> : null}
    {detailId ? <PostDetailsDialog detail={detail} loading={detailLoading} error={detailError} busy={busy} onClose={() => setDetailId("")} onReply={reply}/> : null}
  </>;
}

function PostDetailsDialog({ detail, loading, error, busy, onClose, onReply }: { detail: PostDetails | null; loading: boolean; error: string; busy: boolean; onClose: () => void; onReply: (id: string, message: string) => Promise<void> }) {
  const primaryLabel = detail?.insights.primary?.label || "Views / reach";
  const primaryValue = detail?.insights.primary?.value;
  return <div className="modal-backdrop post-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="resource-modal post-detail-modal" role="dialog" aria-modal="true" aria-labelledby="post-detail-title">
    <div className="modal-heading"><div><span className="eyebrow">Post analytics</span><h2 id="post-detail-title">Post details</h2><p>Live Facebook engagement and Page audience data.</p></div><button className="icon-button" onClick={onClose} aria-label="Close post details"><X/></button></div>
    {loading ? <div className="post-detail-loading" role="status"><LoaderCircle className="spin"/><strong>Loading live Facebook data…</strong><span>Comments and insight metrics are being refreshed.</span></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {detail && !loading ? <>
      <div className="post-detail-hero">{detail.post.mediaUrls?.[0] ? <img src={detail.post.mediaUrls[0]} alt="Post media"/> : null}<div><div className="post-page-identity">{detail.post.page.avatarUrl ? <img src={detail.post.page.avatarUrl} alt=""/> : <span className="channel-icon is-facebook"><FaFacebookF/></span>}<span><strong>{detail.post.page.name}</strong><small>{formatDistanceToNow(new Date(detail.post.publishedAt || detail.post.createdAt), { addSuffix: true })}</small></span></div><p>{detail.post.content}</p>{detail.post.permalinkUrl ? <a className="secondary-button compact" href={detail.post.permalinkUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open on Facebook</a> : null}</div></div>
      <div className="post-stat-grid"><Stat icon={<ThumbsUp/>} label="Reactions" value={detail.post.reactions}/><Stat icon={<MessageCircle/>} label="Comments" value={detail.post.commentsCount}/><Stat icon={<Share2/>} label="Shares" value={detail.post.shares}/><Stat icon={<Eye/>} label={primaryLabel} value={typeof primaryValue === "number" ? primaryValue : "Unavailable"}/></div>
      {detail.warnings.length ? <div className="insight-notice"><strong>Some live data could not be refreshed</strong>{detail.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
      <section className="detail-section"><div className="detail-section-heading"><div><span className="eyebrow">Performance</span><h3>Post metrics</h3></div><BarChart3/></div>{detail.insights.available ? <div className="metric-list">{detail.insights.metrics.filter((metric) => metric.value !== null).map((metric) => <MetricBar key={metric.name} item={{ label: metric.label, value: metric.value || 0 }} max={Math.max(...detail.insights.metrics.map((item) => item.value || 0), 1)} title={metric.description}/>)}</div> : <EmptyInsight text={detail.insights.error || "Meta did not return post insight metrics for this Page or post."}/>}</section>
      <section className="detail-section"><div className="detail-section-heading"><div><span className="eyebrow">Page audience</span><h3>Who follows this Page</h3><p>Aggregated Page audience—not the identity of individual post viewers.</p></div><UsersRound/></div>{detail.audience.available ? <div className="audience-grid"><AudienceBlock title="Gender" items={detail.audience.gender.map((item) => ({ ...item, label: item.label === "M" ? "Men" : item.label === "F" ? "Women" : "Unspecified" }))}/><AudienceBlock title="Age" items={detail.audience.ages}/><AudienceBlock title="Top countries" items={detail.audience.countries}/></div> : <EmptyInsight text={detail.audience.error || "Audience demographics are not available. Meta applies Page eligibility and privacy thresholds."}/>}</section>
      <section className="detail-section post-detail-comments"><div className="detail-section-heading"><div><span className="eyebrow">Conversation</span><h3>Comments ({detail.comments.length})</h3></div><MessageCircle/></div><div className="comment-feed">{detail.comments.length ? detail.comments.map((comment) => <CommentRow key={comment.id} comment={comment} busy={busy} onReply={onReply}/>) : <p className="muted-copy">No comments were returned for this post.</p>}</div></section>
    </> : null}
  </section></div>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) { return <div className="post-stat"><span>{icon}</span><div><small>{label}</small><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></div></div>; }
function EmptyInsight({ text }: { text: string }) { return <div className="insight-empty"><BarChart3/><div><strong>Data unavailable</strong><p>{text}</p><small>Reconnect the Page if the read_insights permission is missing.</small></div></div>; }
function MetricBar({ item, max, title }: { item: DataPoint; max: number; title?: string }) { return <div className="metric-row" title={title}><div><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></div><span className="metric-track"><i style={{ width: `${Math.max(3, item.value / max * 100)}%` }}/></span></div>; }
function AudienceBlock({ title, items }: { title: string; items: DataPoint[] }) { const max = Math.max(...items.map((item) => item.value), 1); return <div className="audience-block"><h4>{title}</h4>{items.length ? items.map((item) => <MetricBar key={item.label} item={item} max={max}/>) : <p className="muted-copy">No data</p>}</div>; }

function CommentRow({ comment, busy, onReply }: { comment: Comment; busy: boolean; onReply: (id: string, message: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  return <article>{comment.authorAvatarUrl ? <img className="avatar" src={comment.authorAvatarUrl} alt=""/> : <span className="avatar">{(comment.authorName || "FB").slice(0, 2).toUpperCase()}</span>}<div><strong>{comment.authorName || "Facebook commenter"}</strong><p>{comment.content}</p><small>on {comment.page.name} · {formatDistanceToNow(new Date(comment.postedAt), { addSuffix: true })} · {comment.reactions} reactions · {comment.status}</small><form onSubmit={(event) => { event.preventDefault(); void onReply(comment.id, value).then(() => setValue("")).catch(() => undefined); }}><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Reply as ${comment.page.name}`} required/><button className="secondary-button compact" disabled={busy}><Send size={14}/>Reply</button></form></div></article>;
}

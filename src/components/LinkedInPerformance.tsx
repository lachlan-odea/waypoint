import { useMemo, useState } from "react";
import type { SocialPost } from "../types";
import {
  canReadStats,
  formatCount,
  formatRate,
  linkedInErrorMessage,
  linkedInSyncNow,
  postKindLabel,
  type LinkedInData,
  type LinkedInPage,
  type LinkedInPostStats,
} from "../linkedin";
import { socialPostTitle } from "../socialPosts";
import { Icon } from "./Icon";

type Props = {
  linkedIn: LinkedInData;
  // The calendar's posts, to name the one each LinkedIn post belongs to.
  posts: SocialPost[];
  isSuperUser: boolean;
  // The calendar's channel filter ("" for every channel) and search box.
  channelFilter: string;
  query: string;
  onOpenPost: (postId: string) => void;
};

type SortKey = "publishedAt" | "impressions" | "clicks" | "reactions" | "comments" | "shares" | "engagement";

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "impressions", label: "Impressions", title: "Times the post was shown" },
  { key: "clicks", label: "Clicks" },
  { key: "reactions", label: "Reactions" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Reposts" },
  {
    key: "engagement",
    label: "Engagement",
    title: "Clicks, reactions, comments and reposts as a share of impressions",
  },
];

function when(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${formatCount(n)}`;
}

// The Social calendar's Performance tab: each connected page's followers
// and last 30 days, then every post on the page from the last year with
// its numbers. Read-only; the functions fill it in overnight.
export function LinkedInPerformance({
  linkedIn,
  posts,
  isSuperUser,
  channelFilter,
  query,
  onOpenPost,
}: Props) {
  const { status, pages, mappings, stats, error } = linkedIn;
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "publishedAt", desc: true });
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const postsById = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  // The pages in view: every linked page, or the one the channel filter
  // points at.
  const orgIds = useMemo(() => {
    const wanted = channelFilter.trim().toLowerCase();
    const ids = mappings
      .filter((m) => !wanted || m.channel.trim().toLowerCase() === wanted)
      .map((m) => m.orgId);
    return [...new Set(ids)];
  }, [mappings, channelFilter]);

  const q = query.trim().toLowerCase();
  const rowsFor = (orgId: string): LinkedInPostStats[] => {
    const rows = stats.filter((s) => {
      if (s.orgId !== orgId) return false;
      if (!q) return true;
      const linked = s.postId ? postsById.get(s.postId) : undefined;
      return (
        s.text.toLowerCase().includes(q) ||
        (linked ? socialPostTitle(linked).toLowerCase().includes(q) : false)
      );
    });
    const value = (s: LinkedInPostStats): number =>
      sort.key === "publishedAt" ? Date.parse(s.publishedAt) || 0 : (s[sort.key] ?? 0);
    return rows.sort((a, b) => (sort.desc ? value(b) - value(a) : value(a) - value(b)));
  };

  async function syncNow() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const r = await linkedInSyncNow();
      const parts = [
        `${r.posts} post${r.posts === 1 ? "" : "s"} read from ${r.pages} page${r.pages === 1 ? "" : "s"}.`,
        r.linked > 0
          ? `${r.linked} matched to calendar post${r.linked === 1 ? "" : "s"} for the first time.`
          : "",
        ...r.warnings,
      ];
      setSyncNote(parts.filter(Boolean).join(" "));
    } catch (err) {
      setSyncNote(linkedInErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  if (error) {
    return (
      <div className="banner">
        LinkedIn's numbers couldn't be read ({error}). If this is the first time, the Firestore rules for
        the LinkedIn collections probably haven't been deployed yet.
      </div>
    );
  }
  if (status === null) return <p className="muted">Loading LinkedIn…</p>;
  if (!status.connected) {
    return (
      <div className="soc-empty">
        <h3>LinkedIn isn't connected</h3>
        <p className="muted">
          Once someone who administers the company page connects it, this tab shows the page's followers,
          its last 30 days and how every post has done.{" "}
          {isSuperUser
            ? "Connect it from Settings → LinkedIn."
            : "A super user connects it from Settings → LinkedIn."}
        </p>
      </div>
    );
  }

  const sortButton = (key: SortKey, label: string, title?: string) => {
    const active = sort.key === key;
    return (
      <button
        type="button"
        className={`li-sort ${active ? "active" : ""}`}
        title={title}
        aria-label={`Sort by ${label}${active ? (sort.desc ? ", highest first" : ", lowest first") : ""}`}
        onClick={() => setSort({ key, desc: active ? !sort.desc : true })}
      >
        {label}
        <span aria-hidden="true">{active ? (sort.desc ? " ↓" : " ↑") : ""}</span>
      </button>
    );
  };

  return (
    <div className="li-perf">
      <div className="li-perf-head">
        <p className="muted small soc-summary">
          Organic results from LinkedIn for the last 12 months, refreshed every night.
          {status.lastSyncAt ? ` Last read ${when(status.lastSyncAt)}.` : " Not read yet."}
        </p>
        {isSuperUser && (
          <button type="button" className="btn-mini" onClick={syncNow} disabled={syncing}>
            {syncing ? "Reading LinkedIn…" : "Refresh now"}
          </button>
        )}
      </div>
      {syncNote && <div className="banner soc-import-note">{syncNote}</div>}
      {!syncNote && status.lastSyncError && <div className="banner">{status.lastSyncError}</div>}

      {orgIds.length === 0 && (
        <p className="muted">
          {channelFilter
            ? `The ${channelFilter} channel isn't linked to a LinkedIn page. A super user links channels to pages in Settings → LinkedIn.`
            : "No channel is linked to a LinkedIn page yet. A super user links them in Settings → LinkedIn."}
        </p>
      )}

      {orgIds.map((orgId) => {
        const page: LinkedInPage | undefined = pages.find((p) => p.orgId === orgId);
        const org = status.organizations?.find((o) => o.id === orgId);
        const name = page?.name ?? org?.name ?? `Page ${orgId}`;
        const rows = rowsFor(orgId);
        const total = stats.filter((s) => s.orgId === orgId).length;
        return (
          <section key={orgId} className="li-page">
            <h3 className="li-page-title">{name}</h3>
            {!canReadStats(org) && !page ? (
              <p className="muted">
                {org
                  ? `LinkedIn only gives a page's statistics to its Super admin, and ${status.memberName ?? "the connected account"} isn't one for ${name}.`
                  : `${status.memberName ?? "The connected account"} has no role on this page, so there's nothing to read.`}
              </p>
            ) : !page ? (
              <p className="muted">
                Nothing has been read for this page yet.{" "}
                {isSuperUser ? "Use Refresh now, or wait for tonight's run." : "It fills in overnight."}
              </p>
            ) : (
              <>
                <div className="kpi-row">
                  <div className="kpi">
                    <p className="kpi-label">Followers</p>
                    <p className="kpi-value">{formatCount(page.followers)}</p>
                    {page.followerGain30d !== undefined && (
                      <p className="kpi-sub">{signed(page.followerGain30d)} in 30 days</p>
                    )}
                  </div>
                  <div className="kpi">
                    <p className="kpi-label">Impressions · 30 days</p>
                    <p className="kpi-value">{formatCount(page.impressions30d)}</p>
                  </div>
                  <div className="kpi">
                    <p className="kpi-label">Clicks · 30 days</p>
                    <p className="kpi-value">{formatCount(page.clicks30d)}</p>
                  </div>
                  <div className="kpi">
                    <p className="kpi-label">Reactions, comments, reposts</p>
                    <p className="kpi-value">
                      {page.reactions30d === undefined
                        ? "–"
                        : formatCount(
                            (page.reactions30d ?? 0) + (page.comments30d ?? 0) + (page.shares30d ?? 0),
                          )}
                    </p>
                  </div>
                  <div className="kpi">
                    <p className="kpi-label">Engagement rate · 30 days</p>
                    <p className="kpi-value">{formatRate(page.engagement30d)}</p>
                  </div>
                </div>

                {total === 0 ? (
                  <p className="muted">No posts on this page in the last 12 months.</p>
                ) : rows.length === 0 ? (
                  <p className="muted">No posts match “{query.trim()}”.</p>
                ) : (
                  <div className="li-table-wrap">
                    <table className="li-table">
                      <thead>
                        <tr>
                          <th scope="col">{sortButton("publishedAt", "Published")}</th>
                          <th scope="col">Post</th>
                          {COLUMNS.map((c) => (
                            <th key={c.key} scope="col" className="num">
                              {sortButton(c.key, c.label, c.title)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => {
                          const linked = s.postId ? postsById.get(s.postId) : undefined;
                          return (
                            <tr key={s.urn}>
                              <td className="li-td-date">{day(s.publishedAt)}</td>
                              <td className="li-td-post">
                                {linked ? (
                                  <button
                                    type="button"
                                    className="li-post-link"
                                    onClick={() => onOpenPost(linked.id)}
                                    title="Open this post on the calendar"
                                  >
                                    {socialPostTitle(linked)}
                                  </button>
                                ) : (
                                  <span className="li-post-text">{s.text || "(no text)"}</span>
                                )}
                                <span className="li-post-meta">
                                  {postKindLabel(s.kind)}
                                  {!linked && " · not on the calendar"}
                                  {" · "}
                                  <a href={s.url} target="_blank" rel="noreferrer">
                                    View on LinkedIn <Icon name="external-link" size={11} />
                                  </a>
                                </span>
                              </td>
                              <td className="num">{formatCount(s.impressions)}</td>
                              <td className="num">{formatCount(s.clicks)}</td>
                              <td className="num">{formatCount(s.reactions)}</td>
                              <td className="num">{formatCount(s.comments)}</td>
                              <td className="num">{formatCount(s.shares)}</td>
                              <td className="num">{formatRate(s.engagement)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SocialPost } from "../types";
import { CHART_MONO, useChartTheme } from "../chartTheme";
import {
  formatCount,
  formatRate,
  postKindLabel,
  useLinkedIn,
  type LinkedInData,
  type LinkedInPage,
  type LinkedInPostStats,
} from "../linkedin";
import { socialPostTitle } from "../socialPosts";
import { Icon, type IconName, type IconTone } from "./Icon";

// LinkedIn's numbers on the Executive Dashboard and the Analytics page.
// Both read what the nightly sync wrote (see functions/src/linkedin.ts):
// each linked page's followers and last 30 days, and its posts' results.
// Organic only, and as fresh as the last sync.

const DAY_MS = 86_400_000;

// The pages with numbers to show: every page a channel is linked to that
// the sync has read at least once.
function pagesInPlay(linkedIn: LinkedInData): LinkedInPage[] {
  const linked = new Set(linkedIn.mappings.map((m) => m.orgId));
  return linkedIn.pages.filter((p) => linked.has(p.orgId));
}

function interactions(p: LinkedInPage): number | undefined {
  if (p.reactions30d === undefined) return undefined;
  return (p.reactions30d ?? 0) + (p.comments30d ?? 0) + (p.shares30d ?? 0);
}

function signed(n: number | undefined): string {
  if (n === undefined) return "–";
  return `${n > 0 ? "+" : ""}${formatCount(n)}`;
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function asOf(pages: LinkedInPage[]): string {
  const latest = pages.map((p) => p.updatedAt ?? "").sort().pop();
  if (!latest) return "";
  return new Date(latest).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// A page's best posts by impressions among those published in a window.
function topPosts(
  stats: LinkedInPostStats[],
  orgId: string,
  fromMs: number,
  toMs: number,
  count: number,
): LinkedInPostStats[] {
  return stats
    .filter((s) => {
      if (s.orgId !== orgId) return false;
      const at = Date.parse(s.publishedAt);
      return at >= fromMs && at <= toMs;
    })
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, count);
}

function postName(s: LinkedInPostStats, postsById: Map<string, SocialPost>): string {
  const linked = s.postId ? postsById.get(s.postId) : undefined;
  return linked ? socialPostTitle(linked) : s.text || "(no text)";
}

// ── Executive Dashboard ────────────────────────────────────────────────

type DashboardProps = {
  socialPosts: SocialPost[];
  onOpenSocialPost: (id: string) => void;
  // The Social calendar, where the Performance tab has every post.
  onOpenCalendar: () => void;
};

// One panel per page: the six numbers for the last 30 days and the three
// posts that did best in that time. Renders nothing until LinkedIn is
// connected and has been read, so the dashboard carries no set-up notes.
export function LinkedInDashboardSection({ socialPosts, onOpenSocialPost, onOpenCalendar }: DashboardProps) {
  const linkedIn = useLinkedIn(true);
  const postsById = useMemo(() => new Map(socialPosts.map((p) => [p.id, p])), [socialPosts]);
  const pages = pagesInPlay(linkedIn);
  // The same span the page totals cover, measured from when they were read.
  const windows = useMemo(
    () =>
      new Map(
        pages.map((p) => {
          const end = Date.parse(p.updatedAt ?? "") || 0;
          return [p.orgId, { from: end - 30 * DAY_MS, to: end }];
        }),
      ),
    [pages],
  );
  if (!linkedIn.status?.connected || pages.length === 0) return null;

  const followers = pages.reduce((t, p) => t + (p.followers ?? 0), 0);
  const impressions = pages.reduce((t, p) => t + (p.impressions30d ?? 0), 0);

  return (
    <section className="an-section">
      <div className="an-section-head">
        <div>
          <div className="eyebrow">Last 30 days · organic</div>
          <h2>LinkedIn</h2>
        </div>
        <p className="an-summary">
          {formatCount(followers)} followers · {formatCount(impressions)} impressions · as of {asOf(pages)}
        </p>
      </div>
      <div className="an-grid">
        {pages.map((page) => {
          const w = windows.get(page.orgId) ?? { from: 0, to: 0 };
          const best = topPosts(linkedIn.stats, page.orgId, w.from, w.to, 3);
          return (
            <section key={page.orgId} className="an-panel">
              <div className="an-panel-head">
                <h3>{page.name}</h3>
                <span className="an-panel-aside">
                  <button type="button" className="link-btn" onClick={onOpenCalendar}>
                    Open the calendar
                  </button>
                </span>
              </div>
              <div className="an-panel-body">
                <div className="ex-minis">
                  <Mini label="Followers" value={formatCount(page.followers)} />
                  <Mini label="New followers" value={signed(page.followerGain30d)} />
                  <Mini label="Impressions" value={formatCount(page.impressions30d)} />
                  <Mini label="Clicks" value={formatCount(page.clicks30d)} />
                  <Mini label="Reactions, comments, reposts" value={formatCount(interactions(page))} />
                  <Mini label="Engagement rate" value={formatRate(page.engagement30d)} />
                </div>
                {best.length === 0 ? (
                  <p className="an-empty">Nothing was posted to this page in the last 30 days.</p>
                ) : (
                  <>
                    <h4 className="li-ins-subhead">Top posts by impressions</h4>
                    <ul className="ex-list">
                      {best.map((s) => {
                        const linked = s.postId ? postsById.get(s.postId) : undefined;
                        const body = (
                          <>
                            <span className="mono ex-date">{shortDay(s.publishedAt)}</span>
                            <span className="ex-row-main">
                              <b>{postName(s, postsById)}</b>
                              <span className="ex-row-sub">
                                {postKindLabel(s.kind)} · {formatCount(s.clicks)} clicks ·{" "}
                                {formatRate(s.engagement)} engagement
                              </span>
                            </span>
                            <span className="mono li-ins-figure">{formatCount(s.impressions)}</span>
                          </>
                        );
                        return (
                          <li key={s.urn}>
                            {linked ? (
                              <button type="button" className="ex-row" onClick={() => onOpenSocialPost(linked.id)}>
                                {body}
                              </button>
                            ) : (
                              <a className="ex-row" href={s.url} target="_blank" rel="noreferrer">
                                {body}
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="ex-mini">
      <span className="ex-mini-value mono">{value}</span>
      <span className="ex-mini-label">{label}</span>
    </div>
  );
}

// ── Analytics ──────────────────────────────────────────────────────────

type AnalyticsProps = {
  socialPosts: SocialPost[];
  // The page's date range (YYYY-MM-DD, "" for open-ended) and its label.
  // It picks which posts the top-posts table ranks; the page totals and the
  // daily chart are always LinkedIn's last 30 days.
  from: string;
  to: string;
  rangeLabel: string;
};

export function LinkedInAnalyticsSection({ socialPosts, from, to, rangeLabel }: AnalyticsProps) {
  const linkedIn = useLinkedIn(true);
  const postsById = useMemo(() => new Map(socialPosts.map((p) => [p.id, p])), [socialPosts]);
  const pages = pagesInPlay(linkedIn);
  const connected = linkedIn.status?.connected === true;

  const fromMs = from ? Date.parse(`${from}T00:00:00`) : 0;
  const toMs = to ? Date.parse(`${to}T23:59:59`) : Number.MAX_SAFE_INTEGER;

  return (
    <section className="an-section">
      <div className="an-section-head">
        <div>
          <div className="eyebrow">Last 30 days · organic</div>
          <h2>LinkedIn</h2>
        </div>
        <p className="an-summary">
          {pages.length > 0
            ? `${pages.length} page${pages.length === 1 ? "" : "s"} · as of ${asOf(pages)}`
            : "Followers, reach and engagement for the company pages"}
        </p>
      </div>

      {pages.length === 0 ? (
        <section className="an-panel">
          <div className="an-panel-body">
            <p className="an-empty">
              {linkedIn.error
                ? `LinkedIn's numbers couldn't be read (${linkedIn.error}).`
                : linkedIn.status === null
                  ? "Loading LinkedIn…"
                  : connected
                    ? "LinkedIn is connected but hasn't been read yet. It fills in overnight, or a super user can run it from Settings → LinkedIn."
                    : "LinkedIn isn't connected. A super user who administers the page connects it from Settings → LinkedIn."}
            </p>
          </div>
        </section>
      ) : (
        pages.map((page) => {
          const best = topPosts(linkedIn.stats, page.orgId, fromMs, toMs, 8);
          return (
            <div key={page.orgId} className="li-ins-page">
              {pages.length > 1 && <h3 className="li-ins-pagename">{page.name}</h3>}
              <div className="an-stats">
                <Tile label="Followers" value={formatCount(page.followers)} icon="group-user-people" tone="sky" />
                <Tile label="New followers" value={signed(page.followerGain30d)} icon="trending-up" tone="mint" />
                <Tile label="Impressions" value={formatCount(page.impressions30d)} icon="graph-chart" tone="violet" />
                <Tile label="Clicks" value={formatCount(page.clicks30d)} icon="mouse" tone="pale" />
                <Tile label="Reactions" value={formatCount(page.reactions30d)} icon="heart" tone="peach" />
                <Tile label="Comments" value={formatCount(page.comments30d)} icon="message-chat" tone="pale" />
                <Tile label="Reposts" value={formatCount(page.shares30d)} icon="rocket" tone="pale" />
                <Tile label="Engagement rate" value={formatRate(page.engagement30d)} icon="target" tone="sky" />
              </div>
              <div className="an-grid">
                <Panel title="Impressions per day" aside={`${page.name} · last 30 days`}>
                  {page.daily && page.daily.length > 0 ? (
                    <DailyImpressions data={page.daily} />
                  ) : (
                    <p className="an-empty">No daily figures yet.</p>
                  )}
                </Panel>
                <Panel title="Top posts by impressions" aside={from || to ? `Published ${rangeLabel}` : "Published in the last 12 months"}>
                  {best.length === 0 ? (
                    <p className="an-empty">No posts on this page were published in that range.</p>
                  ) : (
                    <div className="an-table-wrap">
                      <table className="an-table li-ins-table">
                        <thead>
                          <tr>
                            <th>Post</th>
                            <th className="num">Impressions</th>
                            <th className="num">Clicks</th>
                            <th className="num">Engagement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {best.map((s) => (
                            <tr key={s.urn}>
                              <td>
                                <a className="li-ins-post" href={s.url} target="_blank" rel="noreferrer">
                                  {postName(s, postsById)}
                                </a>
                                <span className="li-ins-meta">
                                  {shortDay(s.publishedAt)} · {postKindLabel(s.kind)}
                                </span>
                              </td>
                              <td className="num mono">{formatCount(s.impressions)}</td>
                              <td className="num mono">{formatCount(s.clicks)}</td>
                              <td className="num mono">{formatRate(s.engagement)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="an-panel">
      <div className="an-panel-head">
        <h3>{title}</h3>
        {aside && <span className="an-panel-aside">{aside}</span>}
      </div>
      <div className="an-panel-body">{children}</div>
    </section>
  );
}

// The Analytics stat tile, taking its figure ready-formatted so it can
// carry a rate or a signed change as well as a count.
function Tile({ label, value, icon, tone }: { label: string; value: string; icon: IconName; tone: IconTone }) {
  return (
    <div className="an-stat">
      <Icon name={icon} size={18} container="tile" tone={tone} />
      <div className="an-stat-text">
        <span className="an-stat-label">{label}</span>
        <span className="an-stat-value">{value}</span>
      </div>
    </div>
  );
}

// One bar per day, one measure, so no legend: the panel's title names it.
function DailyImpressions({ data }: { data: NonNullable<LinkedInPage["daily"]> }) {
  const theme = useChartTheme();
  const rows = data.map((d) => ({ ...d, label: shortDay(d.date) }));
  return (
    <div className="an-chart" style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis
            dataKey="label"
            interval={Math.max(0, Math.ceil(rows.length / 6) - 1)}
            tick={{ fontSize: 11, fill: theme.axisTick, fontFamily: CHART_MONO }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tickFormatter={(v: number) => formatCount(v)}
            tick={{ fontSize: 11, fill: theme.axisTick, fontFamily: CHART_MONO }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: theme.cursorFill }}
            contentStyle={theme.tooltipContentStyle}
            labelStyle={theme.tooltipLabelStyle}
            itemStyle={theme.tooltipItemStyle}
            formatter={(value, name) => [Number(value).toLocaleString(), name]}
          />
          <Bar dataKey="impressions" name="Impressions" fill={theme.bar} maxBarSize={16} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

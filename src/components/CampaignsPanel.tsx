import { useMemo, useState } from "react";
import type { Campaign, Project } from "../types";
import { brandColor } from "../constants";
import { formatShort, todayIso } from "../dates";
import { PHASE_LABEL, campaignPhase, spanDays, type CampaignPhase } from "../campaigns";

type Props = {
  // Every campaign; the panel picks the ones that touch `projects`.
  campaigns: Campaign[];
  // The projects this panel is "about" — the viewer's own on My Desk, the
  // team's on a board. A campaign shows when any of them contributes to it.
  projects: Project[];
  title: string;
  // Who the projects belong to, for the chips' tooltip and the empty copy.
  subject: "you" | "this team";
  // On My Desk: the viewer. Campaigns they own show too, since the owner
  // works like a project's assignees.
  ownerId?: string;
  onOpenCampaign: (campaignId: string) => void;
  onOpenProject: (projectId: string) => void;
  // localStorage key for the collapsed state.
  storageKey: string;
};

// Hide finished campaigns once they're this many days behind us.
const FINISHED_GRACE_DAYS = 14;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) /
      86400000,
  );
}

const PHASE_ORDER: Record<CampaignPhase, number> = {
  live: 0,
  evergreen: 1,
  upcoming: 2,
  finished: 3,
};

// A row of compact campaign cards for My Desk and the team boards: which
// campaigns the projects in front of you are feeding, where each one is in
// its run, what's next, and which of those projects are involved.
export function CampaignsPanel({
  campaigns,
  projects,
  title,
  subject,
  ownerId,
  onOpenCampaign,
  onOpenProject,
  storageKey,
}: Props) {
  const today = todayIso();
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  function setCollapsed(v: boolean) {
    setCollapsedState(v);
    try {
      localStorage.setItem(storageKey, String(v));
    } catch {
      // Storage unavailable — the toggle still works for this page load.
    }
  }

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const relevant = useMemo(
    () =>
      campaigns
        .filter(
          (c) =>
            (!!ownerId && c.ownerId === ownerId) ||
            (c.projectIds ?? []).some((id) => projectById.has(id)),
        )
        // Recently finished campaigns stay a fortnight so the wrap-up work
        // still has its context; older ones drop off.
        .filter(
          (c) =>
            campaignPhase(c, today) !== "finished" ||
            daysBetween(c.endDate, today) <= FINISHED_GRACE_DAYS,
        )
        .sort((a, b) => {
          const pa = PHASE_ORDER[campaignPhase(a, today)];
          const pb = PHASE_ORDER[campaignPhase(b, today)];
          if (pa !== pb) return pa - pb;
          return a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name);
        }),
    [campaigns, projectById, ownerId, today],
  );

  if (relevant.length === 0) return null;

  const live = relevant.filter((c) => campaignPhase(c, today) === "live").length;

  return (
    <section className="workspace-section camps-panel">
      <div className="section-head">
        <div className="section-head-title">
          <button
            className="collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
          >
            <span className={`collapse-icon ${collapsed ? "" : "expanded"}`}>▶</span>
          </button>
          <h2>{title}</h2>
        </div>
        <span className="muted small">
          {relevant.length} campaign{relevant.length === 1 ? "" : "s"}
          {live > 0 ? ` · ${live} live` : ""} ·{" "}
          {ownerId
            ? "ones you own, or that projects you're on are feeding"
            : `projects ${subject === "you" ? "you're on" : "on this board"} are contributing`}
        </span>
      </div>
      {!collapsed && (
        <div className="camps-panel-row">
          {relevant.map((c) => {
            const phase = campaignPhase(c, today);
            const color = c.color || brandColor(c.brand || "No brand");
            const done = c.milestones.filter((m) => m.done).length;
            const next = c.milestones
              .filter((m) => !m.done && m.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))[0];
            const overdue = c.milestones.filter((m) => !m.done && m.date < today).length;
            const involved = (c.projectIds ?? [])
              .map((id) => projectById.get(id))
              .filter((p): p is Project => !!p);
            // Progress through the run, for the time bar under the dates.
            // An evergreen campaign has no run, so its bar sits full.
            const elapsed =
              phase === "finished" || phase === "evergreen"
                ? 1
                : phase === "upcoming"
                  ? 0
                  : Math.min(1, Math.max(0, (daysBetween(c.startDate, today) + 1) / spanDays(c)));
            const when =
              phase === "evergreen"
                ? `Always on ${c.startDate > today ? "from" : "since"} ${formatShort(c.startDate)}`
                : phase === "upcoming"
                ? `starts ${formatShort(c.startDate)} · in ${daysBetween(today, c.startDate)} day${
                    daysBetween(today, c.startDate) === 1 ? "" : "s"
                  }`
                : phase === "live"
                  ? `${daysBetween(today, c.endDate)} day${
                      daysBetween(today, c.endDate) === 1 ? "" : "s"
                    } left · ends ${formatShort(c.endDate)}`
                  : `ended ${formatShort(c.endDate)}`;
            return (
              <article
                key={c.id}
                className={`camp-mini ${phase}`}
                style={{ ["--camp" as string]: color } as React.CSSProperties}
              >
                <div className="camp-mini-top">
                  <span className="soc-chip" style={{ background: brandColor(c.brand || "No brand") }}>
                    {c.brand || "No brand"}
                  </span>
                  <span className={`camp-phase ${phase}`}>
                    {PHASE_LABEL[phase]}
                  </span>
                  {ownerId && c.ownerId === ownerId && (
                    <span className="camp-phase" title="You own this campaign">
                      Owner
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="camp-mini-name"
                  onClick={() => onOpenCampaign(c.id)}
                  title="Open on the Campaigns page"
                >
                  {c.name}
                </button>
                <div className="camp-mini-when muted small">
                  {phase === "evergreen"
                    ? when
                    : `${formatShort(c.startDate)} – ${formatShort(c.endDate)} · ${when}`}
                </div>
                <div className="camp-mini-time" title="How far through the run it is">
                  <div className="camp-mini-time-bar" style={{ width: `${elapsed * 100}%` }} />
                </div>
                {c.milestones.length > 0 && (
                  <div className="camp-mini-ms">
                    <span className="camp-mini-ms-count">
                      {done}/{c.milestones.length} milestones
                    </span>
                    {overdue > 0 && (
                      <span className="camp-mini-overdue">
                        {overdue} overdue
                      </span>
                    )}
                    {next && (
                      <span className="camp-mini-next" title={next.label}>
                        Next: {next.label} · {formatShort(next.date)}
                      </span>
                    )}
                  </div>
                )}
                <div className="camp-mini-projects">
                  {involved.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="camp-card-project"
                      onClick={() => onOpenProject(p.id)}
                      title={`Open project: ${p.title}`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

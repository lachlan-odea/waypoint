import { useMemo, useState } from "react";
import type { Campaign, Designer } from "../types";
import { SOCIAL_CHANNELS, socialChannelColor } from "../constants";
import { formatShort, todayIso } from "../dates";
import {
  campaignOverlaps,
  campaignPhase,
  monthBounds,
  spanDays,
} from "../campaigns";
import { CampaignStrip } from "./CampaignStrip";
import { CampaignModal } from "./CampaignModal";

type Props = {
  campaigns: Campaign[];
  // Owner suggestions in the editor.
  designers: Designer[];
  onSave: (campaign: Campaign) => void;
  onDelete: (id: string) => void;
  // A campaign another view asked us to open (the Social calendar's
  // overlay hands over here). Consumed once the editor is up.
  focusCampaignId?: string | null;
  onFocusHandled?: () => void;
};

type Editing =
  | { mode: "create"; initial: Partial<Campaign> }
  | { mode: "edit"; campaign: Campaign };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// Same Monday-first grid as the Social calendar, so the two line up.
function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const PHASE_LABEL = { upcoming: "Upcoming", live: "Live", finished: "Finished" };

// Whole days from today to `iso` (negative when past).
function daysFromToday(iso: string, today: string): number {
  const a = new Date(`${today}T00:00:00`).getTime();
  const b = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function CampaignsView({
  campaigns,
  designers,
  onSave,
  onDelete,
  focusCampaignId,
  onFocusHandled,
}: Props) {
  const today = todayIso();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [channelFilter, setChannelFilter] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  // Which campaign card has its milestone list expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Open a campaign handed over from another view. Done at render time
  // (setState-during-render is React's sanctioned way to derive state) so
  // there's no flash of the plain view first.
  const [handledFocus, setHandledFocus] = useState<string | null>(null);
  if (focusCampaignId && focusCampaignId !== handledFocus) {
    const c = campaigns.find((x) => x.id === focusCampaignId);
    setHandledFocus(focusCampaignId);
    if (c) {
      setMonth(c.startDate.slice(0, 7));
      setEditing({ mode: "edit", campaign: c });
    }
    // Let the parent clear its request after this render commits.
    queueMicrotask(() => onFocusHandled?.());
  }

  const channels = useMemo(() => {
    const seen = new Set<string>(SOCIAL_CHANNELS);
    const extra = campaigns
      .map((c) => c.channel.trim())
      .filter((c) => c && !seen.has(c));
    return [...SOCIAL_CHANNELS, ...Array.from(new Set(extra)).sort()];
  }, [campaigns]);

  const owners = useMemo(() => {
    const names = new Set<string>();
    campaigns.forEach((c) => c.owner.trim() && names.add(c.owner.trim()));
    designers.forEach((d) => names.add(d.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [campaigns, designers]);

  const cells = useMemo(() => monthGrid(month), [month]);
  const monthLabel = monthTitle(month);

  const monthCampaigns = useMemo(() => {
    const { from, to } = monthBounds(month);
    return campaigns
      .filter((c) => campaignOverlaps(c, from, to))
      .filter((c) => !channelFilter || c.channel.trim() === channelFilter)
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name),
      );
  }, [campaigns, month, channelFilter]);

  // What's coming after this month, so the page isn't a dead end at the
  // end of the current plan.
  const upcoming = useMemo(() => {
    const { to } = monthBounds(month);
    return campaigns
      .filter((c) => c.startDate > to)
      .filter((c) => !channelFilter || c.channel.trim() === channelFilter)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5);
  }, [campaigns, month, channelFilter]);

  function save(campaign: Campaign) {
    onSave(campaign);
    setEditing(null);
    const { from, to } = monthBounds(month);
    if (!campaignOverlaps(campaign, from, to)) {
      setMonth(campaign.startDate.slice(0, 7));
    }
  }

  function remove(id: string) {
    onDelete(id);
    setEditing(null);
  }

  function toggleMilestone(campaign: Campaign, milestoneId: string) {
    onSave({
      ...campaign,
      milestones: campaign.milestones.map((m) =>
        m.id === milestoneId ? { ...m, done: !m.done } : m,
      ),
    });
  }

  function openCreate(startDate?: string) {
    setEditing({
      mode: "create",
      initial: {
        startDate: startDate ?? `${month}-01`,
        channel: channelFilter || undefined,
      },
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="workspace-section soc camps">
      <div className="soc-toolbar">
        <div className="soc-monthnav">
          <button
            className="btn-mini"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <h2 className="soc-month-title">{monthLabel}</h2>
          <button
            className="btn-mini"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Next month"
          >
            ›
          </button>
          {month !== today.slice(0, 7) && (
            <button className="btn-mini" onClick={() => setMonth(today.slice(0, 7))}>
              Today
            </button>
          )}
        </div>

        <div className="filter-quick soc-channels">
          <button
            className={channelFilter === "" ? "active" : ""}
            onClick={() => setChannelFilter("")}
          >
            All channels
          </button>
          {channels.map((c) => (
            <button
              key={c}
              className={channelFilter === c ? "active" : ""}
              onClick={() => setChannelFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="soc-toolbar-right">
          <button className="primary" onClick={() => openCreate()}>
            + New campaign
          </button>
        </div>
      </div>

      <div className="soc-summary">
        <span className="muted small">
          {monthCampaigns.length === 0
            ? `No campaigns touch ${monthLabel}`
            : `${monthCampaigns.length} campaign${
                monthCampaigns.length === 1 ? "" : "s"
              } in ${monthLabel}`}
          {channelFilter ? ` on ${channelFilter}` : ""}
          {" · click a bar to edit, a diamond to flag a milestone, an empty day to start a campaign there"}
        </span>
        <span className="camps-legend muted small">
          <span className="camps-legend-item">
            <span className="camps-swatch live" /> Live
          </span>
          <span className="camps-legend-item">
            <span className="camps-swatch upcoming" /> Upcoming
          </span>
          <span className="camps-legend-item">
            <span className="camps-swatch finished" /> Finished
          </span>
          <span className="camps-legend-item">
            <span className="camp-ms-diamond legend" /> Milestone
          </span>
        </span>
      </div>

      <div className="camps-timeline">
        <div className="soc-grid camps-weekdays" aria-hidden>
          {WEEKDAYS.map((d) => (
            <div key={d} className="soc-weekday">
              {d}
            </div>
          ))}
        </div>
        <CampaignStrip
          campaigns={monthCampaigns}
          cells={cells}
          today={today}
          showDates
          onOpen={(c) => setEditing({ mode: "edit", campaign: c })}
          onCreate={openCreate}
          onToggleMilestone={toggleMilestone}
        />
      </div>

      <div className="section-head camps-list-head">
        <h2>This month's campaigns</h2>
        <span className="muted small">
          Tick milestones off as they happen · open a card to change dates or details
        </span>
      </div>
      {monthCampaigns.length === 0 ? (
        <p className="muted">
          Nothing running in {monthLabel}. Use + New campaign, or click a day on
          the timeline above to start one there.
        </p>
      ) : (
        <div className="camps-grid">
          {monthCampaigns.map((c) => {
            const phase = campaignPhase(c, today);
            const done = c.milestones.filter((m) => m.done).length;
            const open = expanded.has(c.id) || c.milestones.length <= 4;
            const shown = open ? c.milestones : c.milestones.slice(0, 3);
            const phaseNote =
              phase === "upcoming"
                ? `starts in ${daysFromToday(c.startDate, today)} day${
                    daysFromToday(c.startDate, today) === 1 ? "" : "s"
                  }`
                : phase === "live"
                  ? `${daysFromToday(c.endDate, today)} day${
                      daysFromToday(c.endDate, today) === 1 ? "" : "s"
                    } left`
                  : `ended ${formatShort(c.endDate)}`;
            return (
              <article
                key={c.id}
                className={`camp-card ${phase}`}
                style={{ ["--camp" as string]: c.color } as React.CSSProperties}
              >
                <div className="camp-card-bar" />
                <div className="camp-card-body">
                  <div className="camp-card-top">
                    <span
                      className="soc-chip"
                      style={{ background: socialChannelColor(c.channel) }}
                    >
                      {c.channel || "No channel"}
                    </span>
                    <span className={`camp-phase ${phase}`} title={phaseNote}>
                      {PHASE_LABEL[phase]}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="camp-card-title"
                    onClick={() => setEditing({ mode: "edit", campaign: c })}
                    title="Edit campaign"
                  >
                    {c.name}
                  </button>
                  <p className="camp-card-dates muted small">
                    {formatShort(c.startDate)} – {formatShort(c.endDate)} ·{" "}
                    {spanDays(c)} day{spanDays(c) === 1 ? "" : "s"} · {phaseNote}
                    {c.owner ? ` · ${c.owner}` : ""}
                  </p>
                  {c.description && (
                    <p className="camp-card-desc">{c.description}</p>
                  )}
                  {c.milestones.length > 0 ? (
                    <>
                      <div className="camp-card-progress" title={`${done} of ${c.milestones.length} milestones done`}>
                        <div
                          className="camp-card-progress-bar"
                          style={{ width: `${(done / c.milestones.length) * 100}%` }}
                        />
                      </div>
                      <ul className="camp-card-ms">
                        {shown.map((m) => (
                          <li key={m.id}>
                            <label
                              className={`camp-card-ms-row ${m.done ? "done" : ""} ${
                                m.date < today && !m.done ? "overdue" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={m.done}
                                onChange={() => toggleMilestone(c, m.id)}
                              />
                              <span className="camp-card-ms-date">
                                {formatShort(m.date)}
                              </span>
                              <span className="camp-card-ms-label">{m.label}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      {c.milestones.length > 4 && (
                        <button
                          type="button"
                          className="link-btn camp-card-more"
                          onClick={() => toggleExpanded(c.id)}
                        >
                          {expanded.has(c.id)
                            ? "Show fewer"
                            : `Show all ${c.milestones.length} milestones`}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="muted small" style={{ margin: 0 }}>
                      No milestones yet.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="camps-upcoming">
          <div className="section-head">
            <h2>Coming up</h2>
            <span className="muted small">After {monthLabel}</span>
          </div>
          <ul className="camps-upcoming-list">
            {upcoming.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="camps-upcoming-row"
                  onClick={() => setEditing({ mode: "edit", campaign: c })}
                >
                  <span className="camps-swatch" style={{ background: c.color }} />
                  <span className="camps-upcoming-name">{c.name}</span>
                  <span className="muted small">
                    {formatShort(c.startDate)} – {formatShort(c.endDate)}
                    {c.channel ? ` · ${c.channel}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && editing.mode === "create" && (
        <CampaignModal
          mode="create"
          initial={editing.initial}
          channels={channels}
          owners={owners}
          campaignCount={campaigns.length}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
      {editing && editing.mode === "edit" && (
        <CampaignModal
          key={editing.campaign.id}
          mode="edit"
          initial={editing.campaign}
          channels={channels}
          owners={owners}
          campaignCount={campaigns.length}
          onCancel={() => setEditing(null)}
          onSave={save}
          onDelete={() => remove(editing.campaign.id)}
        />
      )}
    </section>
  );
}

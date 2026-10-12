import type { Campaign } from "../types";
import { formatShort } from "../dates";
import { campaignPhase, layoutWeek, weeksOf } from "../campaigns";

type Props = {
  // Campaigns that touch the month in view (already channel-filtered).
  campaigns: Campaign[];
  // The month grid's cells, nulls for padding, as the post calendar uses.
  cells: (string | null)[];
  today: string;
  onOpen: (campaign: Campaign) => void;
  // Start a new campaign on this day.
  onCreate: (startDate: string) => void;
  // Flip a milestone's done flag in place.
  onToggleMilestone: (campaign: Campaign, milestoneId: string) => void;
};

// The campaign timeline above the post calendar: one grid row per week,
// seven columns that line up with the day cells below, campaigns drawn as
// bars spanning their days with a diamond per milestone. Bars pick up where
// they left off from one week to the next, with a flat edge on the side
// that continues.
export function CampaignStrip({
  campaigns,
  cells,
  today,
  onOpen,
  onCreate,
  onToggleMilestone,
}: Props) {
  const weeks = weeksOf(cells);
  return (
    <div className="camp-strip" role="list" aria-label="Campaigns">
      {weeks.map((week, wi) => {
        const segments = layoutWeek(campaigns, week);
        const lanes = Math.max(1, ...segments.map((s) => s.lane + 1));
        return (
          <div
            key={wi}
            className="camp-week"
            style={{ gridTemplateRows: `repeat(${lanes}, var(--camp-lane))` }}
          >
            {week.map((iso, ci) => (
              <button
                key={ci}
                type="button"
                className={`camp-daybg ${iso === null ? "pad" : ""} ${
                  iso === today ? "today" : ""
                }`}
                style={{ gridColumn: ci + 1, gridRow: `1 / span ${lanes}` }}
                onClick={iso ? () => onCreate(iso) : undefined}
                disabled={iso === null}
                tabIndex={-1}
                aria-label={iso ? `New campaign starting ${iso}` : undefined}
                title={iso ? `New campaign starting ${formatShort(iso)}` : undefined}
              />
            ))}
            {segments.map((seg) => {
              const c = seg.campaign;
              const span = seg.endCol - seg.startCol + 1;
              const phase = campaignPhase(c, today);
              const done = c.milestones.filter((m) => m.done).length;
              return (
                <div
                  key={c.id}
                  role="listitem"
                  className={`camp-bar ${phase} ${
                    seg.continuesBefore ? "cont-before" : ""
                  } ${seg.continuesAfter ? "cont-after" : ""}`}
                  style={{
                    gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                    gridRow: seg.lane + 1,
                    background: c.color,
                  }}
                >
                  <button
                    type="button"
                    className="camp-bar-main"
                    onClick={() => onOpen(c)}
                    title={`${c.name} · ${formatShort(c.startDate)} – ${formatShort(
                      c.endDate,
                    )}${c.channel ? ` · ${c.channel}` : ""}${
                      c.milestones.length
                        ? ` · ${done}/${c.milestones.length} milestones done`
                        : ""
                    }`}
                  >
                    <span className="camp-bar-name">{c.name}</span>
                  </button>
                  {seg.milestones.map(({ milestone: m, col }) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`camp-ms ${m.done ? "done" : ""}`}
                      style={{ left: `${((col - seg.startCol + 0.5) / span) * 100}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMilestone(c, m.id);
                      }}
                      title={`${m.label} · ${formatShort(m.date)} · ${
                        m.done ? "done — click to unflag" : "click to flag as done"
                      }`}
                      aria-label={`${m.label}, ${m.done ? "done" : "not done"}`}
                      aria-pressed={m.done}
                    >
                      <span className="camp-ms-diamond" aria-hidden />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

import type { Campaign } from "../types";
import { formatShort } from "../dates";
import { PHASE_LABEL, campaignPhase } from "../campaigns";

type Props = {
  campaign: Campaign;
  // The day this band is drawn in.
  iso: string;
  today: string;
  // Print the name (and phase) on this segment — the campaign's first day
  // and every Monday; the days between are a bare bar so the cell stays
  // readable.
  showName: boolean;
  // Smaller, for the Social calendar's overlay.
  compact?: boolean;
  onClick: () => void;
};

// One day's slice of a campaign bar. Drawn cell by cell on both calendars;
// square edges where the campaign continues into the neighbouring day and
// rounded where it starts or ends, so a run of slices reads as one bar.
//
// The phase is in the paint, not just the label: a live campaign is a
// solid bar in its brand colour, an upcoming one is hatched, a finished one
// is washed out with a tick. The same three looks are used in the legend.
export function CampaignBand({
  campaign: c,
  iso,
  today,
  showName,
  compact,
  onClick,
}: Props) {
  const phase = campaignPhase(c, today);
  const starts = c.startDate === iso;
  const ends = c.endDate === iso;
  return (
    <button
      type="button"
      className={`camp-band phase-${phase} ${showName ? "named" : ""} ${
        starts ? "starts" : ""
      } ${ends ? "ends" : ""} ${compact ? "compact" : ""}`}
      style={{ ["--camp" as string]: c.color } as React.CSSProperties}
      onClick={onClick}
      title={`${c.name} · ${PHASE_LABEL[phase]} · ${formatShort(c.startDate)} – ${formatShort(
        c.endDate,
      )}${c.brand ? ` · ${c.brand}` : ""}`}
    >
      {showName && (
        <>
          <span className="camp-band-name">{c.name}</span>
          <span className="camp-band-phase">
            {phase === "finished" ? "✓ " : ""}
            {PHASE_LABEL[phase]}
          </span>
        </>
      )}
    </button>
  );
}

import type { Campaign, MarketingEvent } from "../types";
import {
  EVENT_CHECKLIST,
  checklistDone,
  eventDays,
  eventPhase,
  eventStatusMeta,
  followUpMissing,
  formatEventDates,
} from "../events";
import { brandColor } from "../constants";
import { eventStatusTone } from "../statusTone";
import { Icon } from "./Icon";

type Props = {
  event: MarketingEvent;
  // The day cell this card sits in (YYYY-MM-DD) and today.
  day: string;
  today: string;
  // The campaign the event is filed under, if any.
  campaign?: Campaign;
  onClick: () => void;
  // Shown on the first day of the run (or the first day of the month, for
  // a run that started earlier). Later days get the compact form so a
  // week-long show doesn't repeat its whole card seven times.
  compact?: boolean;
};

// "Priya Nair" → "PN", "Maddie" → "M". Leads are free text, not designers.
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1 && words[0].length <= 2) return words[0].toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function divisionColor(division: string): string {
  const d = division.trim().toLowerCase();
  if (d === "landside") return brandColor("CargoWise Landside");
  if (d === "cargowise") return brandColor("CargoWise");
  return brandColor("No brand");
}

// An event on the Events calendar, drawn like a post on the Social
// calendar: the division on the left edge, the status pill washing the
// card, the name, where and when, then the checklist and the glyphs that
// say what's attached.
export function EventCalendarCard({ event: e, day, today, campaign, onClick, compact }: Props) {
  const ph = eventPhase(e, today);
  const status = eventStatusMeta(ph);
  const division = divisionColor(e.division);
  const done = checklistDone(e);
  const total = EVENT_CHECKLIST.length;
  const missing = followUpMissing(e, today);
  const days = eventDays(e);
  const dayN = e.startDate ? Math.round((new Date(`${day}T00:00:00`).getTime() - new Date(`${e.startDate}T00:00:00`).getTime()) / 86400000) + 1 : 1;
  const title = `${e.name} · ${formatEventDates(e)}${e.location ? ` · ${e.location}` : ""} · ${status.label}`;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`soc-card ev-cal-card ${compact ? "compact" : ""} ${ph === "cancelled" ? "cancelled" : ""}`}
      style={{ borderLeftColor: division, ["--status" as string]: status.color } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onClick();
        }
      }}
      title={title}
    >
      <div className="soc-card-top">
        <span className="soc-chip" style={{ background: division }}>
          {e.division || "Event"}
        </span>
        {compact ? (
          <span className="ev-cal-day">
            Day {dayN}
            {days ? ` of ${days}` : ""}
          </span>
        ) : (
          <span className={`soc-status wp-status ${eventStatusTone(ph)}`} title={`Status: ${status.label}`}>
            <span className="soc-status-label">{status.label}</span>
          </span>
        )}
      </div>
      <div className="soc-card-title">{e.name}</div>
      {!compact && (
        <>
          <div className="ev-cal-meta">
            {e.location?.trim() && (
              <span>
                <Icon name="location-pin" size={11} /> {e.location.trim()}
              </span>
            )}
            <span className="mono">{formatEventDates(e)}</span>
          </div>
          {e.region && <span className="soc-category ev-cal-region">{e.region}</span>}
          <div className="soc-card-foot">
            <span
              className={`ev-cal-check ${done === total ? "full" : ""}`}
              title={`${done} of ${total} checklist items done${missing.length ? ` · needs ${missing.join(", ")}` : ""}`}
            >
              <i>
                <b style={{ width: `${(done / total) * 100}%` }} />
              </i>
              <span className="mono">
                {done}/{total}
              </span>
            </span>
            <span className="soc-card-links">
              {missing.length > 0 && (
                <span className="ev-cal-owed" title={`Needs follow-up: ${missing.join(", ")}`}>
                  <Icon name="clock-circle" size={12} />
                </span>
              )}
              {campaign && (
                <span title={`Campaign: ${campaign.name}`}>
                  <Icon name="target" size={12} />
                </span>
              )}
              {e.itinerary && (
                <span title={e.itinerarySharePointUrl ? "Itinerary on SharePoint" : "Itinerary drafted"}>
                  <Icon name="map-path" size={12} />
                </span>
              )}
              {e.speakingOpportunity?.trim() && (
                <span title={`Speaking: ${e.speakingOpportunity.trim()}`}>
                  <Icon name="lightbulb" size={12} />
                </span>
              )}
              {(e.sponsor || e.booth) && (
                <span title={[e.sponsor ? "Sponsor" : "", e.booth ? "Booth" : ""].filter(Boolean).join(" · ")}>
                  <Icon name="store" size={12} />
                </span>
              )}
            </span>
            {e.marketingLead?.trim() && (
              <span className="soc-owner" title={`Marketing lead: ${e.marketingLead}`}>
                {initialsOf(e.marketingLead)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

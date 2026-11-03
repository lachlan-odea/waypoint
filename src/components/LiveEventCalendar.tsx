import { useMemo, useState } from "react";
import type { LiveEventBlackout, LiveEventRequest } from "../types";
import { blackoutRange, blackoutsOn } from "../liveEventRequests";
import { Icon } from "./Icon";

type Props = {
  requests: LiveEventRequest[];
  blackouts: LiveEventBlackout[];
  today: string;
  // The event's start time for its chip, "" when not set.
  startTime: (r: LiveEventRequest) => string;
  onOpenRequest: (id: string) => void;
  onAddEvent: (dateIso: string) => void;
  onAddBlackout: () => void;
  onEditBlackout: (blackout: LiveEventBlackout) => void;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// The month as whole weeks, Monday first; null pads the edges.
function monthCells(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

// A month of the Video team's live events: approved events solid, pending
// ones dashed (declined don't appear), and the periods the team isn't
// taking bookings for shaded across their days. A day's + adds an event
// on that day; a shaded period opens for editing.
export function LiveEventCalendar({
  requests,
  blackouts,
  today,
  startTime,
  onOpenRequest,
  onAddEvent,
  onAddBlackout,
  onEditBlackout,
}: Props) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const cells = useMemo(() => monthCells(month), [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, LiveEventRequest[]>();
    for (const r of requests) {
      if (r.status === "declined" || !r.eventDate) continue;
      const list = map.get(r.eventDate) ?? [];
      list.push(r);
      map.set(r.eventDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => startTime(a).localeCompare(startTime(b)) || a.eventName.localeCompare(b.eventName));
    }
    return map;
  }, [requests, startTime]);

  const undated = requests.filter((r) => r.status === "approved" && !r.eventDate).length;

  return (
    <div className="ler-cal">
      <div className="ler-cal-head">
        <div className="ler-cal-nav">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <h3>{monthLabel(month)}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setMonth(thisMonth)}
            disabled={month === thisMonth}
          >
            Today
          </button>
        </div>
        <div className="ler-cal-tools">
          <span className="ler-cal-legend muted small" aria-hidden>
            <span className="ler-cal-key approved" /> Approved
            <span className="ler-cal-key pending" /> Pending
            <span className="ler-cal-key blackout" /> No bookings
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAddBlackout}>
            Block out dates
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onAddEvent(today)}>
            <Icon name="calendar" size={14} /> Add event
          </button>
        </div>
      </div>

      <div className="ler-cal-grid" role="grid" aria-label={`Live events in ${monthLabel(month)}`}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="ler-cal-wd" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`pad-${i}`} className="ler-cal-cell empty" role="gridcell" />;
          const periods = blackoutsOn(iso, blackouts);
          const items = byDate.get(iso) ?? [];
          const past = iso < today;
          // The period's name shows on its first day and again at the
          // start of each later week it runs into.
          const labelHere = (b: LiveEventBlackout) => b.start === iso || i % 7 === 0 || iso.endsWith("-01");
          return (
            <div
              key={iso}
              role="gridcell"
              className={`ler-cal-cell ${past ? "past" : ""} ${iso === today ? "today" : ""} ${periods.length ? "blackout" : ""}`}
            >
              <div className="ler-cal-daybar">
                <span className="ler-cal-daynum">{Number(iso.slice(8))}</span>
                {!past && (
                  <button
                    type="button"
                    className="ler-cal-add"
                    title="Add an event on this day"
                    aria-label={`Add an event on ${iso}`}
                    onClick={() => onAddEvent(iso)}
                  >
                    +
                  </button>
                )}
              </div>
              {periods.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="ler-cal-bo"
                  title={`${b.reason || "No bookings"}: ${blackoutRange(b)}. Click to change.`}
                  onClick={() => onEditBlackout(b)}
                >
                  {labelHere(b) ? b.reason || "No bookings" : " "}
                </button>
              ))}
              {items.map((r) => {
                const t = startTime(r);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ler-cal-ev ${r.status}`}
                    title={`${r.eventName || "Untitled event"}${t ? ` · ${t}` : ""} · ${r.status}`}
                    onClick={() => onOpenRequest(r.id)}
                  >
                    {t ? <span className="ler-cal-ev-t">{t}</span> : null}
                    {r.eventName || "Untitled event"}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {undated > 0 && (
        <p className="muted small ler-cal-foot">
          {undated} approved event{undated === 1 ? "" : "s"} with no date yet{" "}
          {undated === 1 ? "isn't" : "aren't"} on the calendar. They're in the Upcoming list.
        </p>
      )}
    </div>
  );
}

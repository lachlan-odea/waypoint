import { useEffect, useState, type ReactNode } from "react";
import { monthBounds } from "../campaigns";

type Props = {
  title: string;
  // The YYYY-MM the calendar is showing, which the range starts on.
  month: string;
  // How many rows the range would export, and what they're called, so the
  // button can say what's coming before anyone downloads an empty file.
  count: (from: string, to: string) => number;
  noun: (n: number) => string;
  onExport: (from: string, to: string) => void;
  onCancel: () => void;
  // Choices particular to one calendar, drawn under the dates.
  children?: ReactNode;
};

function quarterBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const first = Math.floor((m - 1) / 3) * 3 + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: monthBounds(`${y}-${pad(first)}`).from,
    to: monthBounds(`${y}-${pad(first + 2)}`).to,
  };
}

function yearBounds(month: string): { from: string; to: string } {
  const y = month.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// With the year, since a range can cross one.
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// Pick a date range and download what falls in it as CSV. Shared by the
// Social calendar and the Campaigns calendar; each supplies its own count
// and export.
export function ExportCsvModal({
  title,
  month,
  count,
  noun,
  onExport,
  onCancel,
  children,
}: Props) {
  const initial = monthBounds(month);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const valid = !!from && !!to && from <= to;
  const n = valid ? count(from, to) : 0;

  const presets = [
    { label: monthName(month), ...monthBounds(month) },
    { label: `Q${Math.floor((Number(month.slice(5)) - 1) / 3) + 1} ${month.slice(0, 4)}`, ...quarterBounds(month) },
    { label: month.slice(0, 4), ...yearBounds(month) },
  ];

  return (
    <div className="modal-overlay confirm-overlay" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 className="modal-title-static" id="csv-export-title">
            {title}
          </h2>
        </header>
        <div className="modal-body">
          <div className="filter-quick csv-presets" role="group" aria-label="Quick ranges">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className={from === p.from && to === p.to ? "active" : ""}
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="modal-grid">
            <label className="field">
              <span>From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  const next = e.target.value;
                  setFrom(next);
                  if (next && to && to < next) setTo(next);
                }}
              />
            </label>
            <label className="field">
              <span>To</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
              {from && to && from > to && (
                <span className="field-hint warn">The end is before the start.</span>
              )}
            </label>
          </div>
          {children}
          <p className="muted small" style={{ margin: 0 }}>
            {!valid
              ? "Pick a start and an end date."
              : n === 0
                ? `Nothing between ${dayLabel(from)} and ${dayLabel(to)}.`
                : `${n} ${noun(n)} between ${dayLabel(from)} and ${dayLabel(to)}.`}
          </p>
        </div>
        <footer className="modal-foot">
          <button style={{ marginRight: "auto" }} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!valid || n === 0}
            onClick={() => onExport(from, to)}
          >
            Download CSV
          </button>
        </footer>
      </div>
    </div>
  );
}

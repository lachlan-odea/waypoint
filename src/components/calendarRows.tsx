import type { ReactNode } from "react";

// The month calendars lay their day cells straight into one CSS grid, but
// assistive tech needs table → row → cell. This groups the rendered cells
// into weeks of seven, each a role="row" that is display: contents, so the
// grid layout is untouched.
export function CalendarRows({ cells }: { cells: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} role="row" className="cal-row">
          {row}
        </div>
      ))}
    </>
  );
}

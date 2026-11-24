import { daysUntil, formatShort } from "../../dates";

// "T−12" style countdown for a date, with the words to sit under it. Shared
// by the project, campaign and event pages' header bands. Kept out of
// ItemPage.tsx so that file exports only components (fast refresh).
export function countdownFor(
  days: number | null,
  words: { none: string; before: string; today: string; after: string },
): { value: string; label: string } {
  if (days === null) return { value: "—", label: words.none };
  if (days > 0) {
    return {
      value: `T−${days}`,
      label: days === 1 ? words.before.replace("days", "day") : words.before,
    };
  }
  if (days === 0) return { value: "Today", label: words.today };
  const n = -days;
  return {
    value: `T+${n}`,
    label: n === 1 ? words.after.replace("days", "day") : words.after,
  };
}

// The countdown for an event's header band, from its dates and where it is
// in its life (eventPhase): "TBC" while undated, "On now" while it runs,
// days to its start before and days since its end after.
export function eventCountdown(
  e: { startDate: string; endDate: string; tbcMonth?: string; year: number },
  phase: string,
): { value: string; label: string } {
  if (phase === "cancelled") return { value: "Off", label: "event cancelled" };
  if (!e.startDate) {
    if (!e.tbcMonth) return { value: "TBC", label: `dates to be confirmed · ${e.year}` };
    const [y, m] = e.tbcMonth.split("-").map(Number);
    const month = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return { value: "TBC", label: `pencilled for ${month}` };
  }
  if (phase === "live") return { value: "On now", label: `until ${formatShort(e.endDate)}` };
  if (phase === "done") {
    return countdownFor(daysUntil(e.endDate), { none: "", before: "days to the end", today: "ends today", after: "days since the event" });
  }
  return countdownFor(daysUntil(e.startDate), {
    none: "no start date",
    before: "days to the event",
    today: "starts today",
    after: "days since it started",
  });
}

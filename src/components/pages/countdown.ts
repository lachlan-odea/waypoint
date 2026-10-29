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

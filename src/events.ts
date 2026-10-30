import type { EventChecklist, EventStatus, MarketingEvent } from "./types";

// Pure helpers for the Events page: statuses and their colours, the
// pre-event checklist, date maths and the follow-up rule. No React.

// Statuses in lifecycle order, with the colour each renders in. Every one is
// dark enough to carry white text on its pill, like the social statuses.
export const EVENT_STATUSES: {
  value: EventStatus;
  label: string;
  color: string;
}[] = [
  { value: "prospect", label: "Prospect", color: "#8b96a8" },
  { value: "planning", label: "Planning", color: "#2f6fb0" },
  { value: "confirmed", label: "Confirmed", color: "#371ee1" },
  { value: "live", label: "Live", color: "#0c5a2e" },
  { value: "done", label: "Done", color: "#1d1765" },
  { value: "cancelled", label: "Cancelled", color: "#8a1c16" },
];

export function eventStatusMeta(status: EventStatus | undefined) {
  return EVENT_STATUSES.find((s) => s.value === status) ?? EVENT_STATUSES[0];
}

// Which part of the business is running the event. Suggestions: the field
// takes any text.
export const EVENT_DIVISIONS = ["CargoWise", "Landside"] as const;

// The portal's regions, as suggestions for the region field and the filter.
export const EVENT_REGIONS = [
  "Americas",
  "EMEA",
  "LATAM",
  "APAC",
  "China",
  "Global",
  "A2P",
  "WTA",
] as const;

// Fixed approximate rates to US dollars, the ones the portal export used.
// Good enough to compare spend across events; not for invoicing.
export const CURRENCIES: { code: string; usd: number }[] = [
  { code: "USD", usd: 1 },
  { code: "AUD", usd: 0.65 },
  { code: "EUR", usd: 1.08 },
  { code: "GBP", usd: 1.27 },
  { code: "NZD", usd: 0.6 },
  { code: "RMB", usd: 0.14 },
];

export function toUsd(amount: number, currency: string): number {
  const rate = CURRENCIES.find((c) => c.code === currency)?.usd ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

// The ten things to have done before, at and after an event, in the order
// the team works through them. The last three are what "needs follow-up"
// checks once the event is over.
export const EVENT_CHECKLIST: {
  key: keyof EventChecklist;
  label: string;
  // What's missing when this is unticked after the event, for the follow-up
  // list. Only the after-event items have one.
  followUp?: string;
}[] = [
  { key: "budgetApproved", label: "Budget approved" },
  { key: "boothBooked", label: "Booth / tickets booked" },
  { key: "campaignCodeCreated", label: "Campaign code created" },
  { key: "travelBooked", label: "Travel & accommodation" },
  { key: "collateralReady", label: "Collateral & presentation" },
  { key: "bookWithMeLive", label: "Book-with-me link live" },
  { key: "leadScanningArranged", label: "Lead scanning arranged" },
  { key: "feedbackFormSent", label: "Feedback form sent", followUp: "feedback form" },
  { key: "reportFiled", label: "Event report filed", followUp: "report" },
  { key: "resultsLogged", label: "Comms & opps logged", followUp: "results" },
];

export function emptyChecklist(): EventChecklist {
  return {
    budgetApproved: false,
    boothBooked: false,
    campaignCodeCreated: false,
    travelBooked: false,
    collateralReady: false,
    bookWithMeLive: false,
    leadScanningArranged: false,
    feedbackFormSent: false,
    reportFiled: false,
    resultsLogged: false,
  };
}

export function checklistDone(e: Pick<MarketingEvent, "checklist">): number {
  return EVENT_CHECKLIST.filter((item) => e.checklist?.[item.key]).length;
}

// The status as it stands today. The stored status is what the team set;
// a confirmed event that has started is live, and one that has ended is
// done, without anyone having to come back and change it. Prospects,
// planning and cancelled events are taken as stored.
export function eventPhase(e: MarketingEvent, today: string): EventStatus {
  if (e.status === "cancelled") return "cancelled";
  if (e.status === "done") return "done";
  if ((e.status === "confirmed" || e.status === "live") && e.startDate && e.endDate) {
    if (e.endDate < today) return "done";
    if (e.startDate <= today) return "live";
    return "confirmed";
  }
  return e.status;
}

// Past events the team still owes something on: a feedback form, a report
// or logged results. Returns what's missing, in the checklist's words.
export function followUpMissing(e: MarketingEvent, today: string): string[] {
  if (eventPhase(e, today) !== "done") return [];
  return EVENT_CHECKLIST.filter(
    (item) => item.followUp && !e.checklist?.[item.key],
  ).map((item) => item.followUp as string);
}

export function eventNeedsFollowUp(e: MarketingEvent, today: string): boolean {
  return followUpMissing(e, today).length > 0;
}

// Does the event touch any day between `from` and `to` inclusive? A dated
// event by its run; one with only a month by that month; a TBC one never.
export function eventOverlaps(e: MarketingEvent, from: string, to: string): boolean {
  if (e.startDate && e.endDate) return e.startDate <= to && e.endDate >= from;
  if (e.tbcMonth) return e.tbcMonth >= from.slice(0, 7) && e.tbcMonth <= to.slice(0, 7);
  return false;
}

// Which calendar year the event belongs to: the one its dates fall in, or
// the planning year it was filed under while they're TBC. A run that
// crosses New Year belongs to both.
export function eventInYear(e: MarketingEvent, year: number): boolean {
  const y = String(year);
  if (e.startDate) return e.startDate.startsWith(y) || e.endDate.startsWith(y);
  if (e.tbcMonth) return e.tbcMonth.startsWith(y);
  return e.year === year;
}

// YYYY-MM the event is listed under: its start month, or the month it's
// pencilled in for. Empty when even the month is unknown.
export function eventMonthKey(e: MarketingEvent): string {
  if (e.startDate) return e.startDate.slice(0, 7);
  return e.tbcMonth ?? "";
}

// Sort key: dated events by start, month-only ones after the dated ones of
// their month, fully TBC ones at the end of their year.
export function eventSortKey(e: MarketingEvent): string {
  if (e.startDate) return e.startDate;
  if (e.tbcMonth) return `${e.tbcMonth}-32`;
  return `${e.year}-13`;
}

// Dated events running on a given day.
export function eventsOn(events: MarketingEvent[], iso: string): MarketingEvent[] {
  return events.filter((e) => e.startDate && e.startDate <= iso && iso <= e.endDate);
}

// Whole days in the run, 0 while the dates are TBC.
export function eventDays(e: MarketingEvent): number {
  if (!e.startDate || !e.endDate) return 0;
  const a = new Date(`${e.startDate}T00:00:00`).getTime();
  const b = new Date(`${e.endDate}T00:00:00`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function dayOf(iso: string): number {
  return Number(iso.slice(8, 10));
}

function monthShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short" });
}

export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// "21–23 Jan 2026", "30 Mar – 2 Apr 2026", "4 Mar 2026", "Feb 2026 (TBC)"
// or "TBC". The year is shown when it isn't the one asked for, so a list
// for 2026 doesn't repeat it on every row.
export function formatEventDates(e: MarketingEvent, inYear?: number): string {
  const showYear = (iso: string) => !inYear || !iso.startsWith(String(inYear));
  if (!e.startDate || !e.endDate) {
    if (e.tbcMonth) {
      const [y, m] = e.tbcMonth.split("-").map(Number);
      const name = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: "short",
      });
      return inYear === y ? `${name} (TBC)` : `${name} ${y} (TBC)`;
    }
    return inYear === e.year ? "TBC" : `${e.year} (TBC)`;
  }
  const yearSuffix = showYear(e.endDate) ? ` ${e.endDate.slice(0, 4)}` : "";
  if (e.startDate === e.endDate) {
    return `${dayOf(e.startDate)} ${monthShort(e.startDate)}${yearSuffix}`;
  }
  if (e.startDate.slice(0, 7) === e.endDate.slice(0, 7)) {
    return `${dayOf(e.startDate)}–${dayOf(e.endDate)} ${monthShort(e.startDate)}${yearSuffix}`;
  }
  return `${dayOf(e.startDate)} ${monthShort(e.startDate)} – ${dayOf(e.endDate)} ${monthShort(e.endDate)}${yearSuffix}`;
}

// WiseTech's financial year runs July to June: August 2026 is FY27.
export function fiscalYear(iso: string): string {
  if (!iso) return "";
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `FY${String((m >= 7 ? y + 1 : y) % 100).padStart(2, "0")}`;
}

// What the search box matches against.
export function eventSearchText(e: MarketingEvent): string {
  return [
    e.name,
    e.location,
    e.region,
    e.division,
    e.marketingLead,
    e.salesLead,
    e.salesAttendees,
    e.campaignCode,
    e.audience,
    e.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// Whole dollars with thousands separators; "—" for nothing.
export function formatUsd(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

import type {
  EventItinerary,
  ItineraryDay,
  ItineraryItem,
  ItineraryItemType,
  ItineraryRow,
  MarketingEvent,
} from "./types";

// Pure helpers for an event's attendee itinerary: drafting one from the
// event, the checks the planner runs before it's sent, and formatting.
// No React.

export const ITINERARY_ITEM_TYPES: {
  value: ItineraryItemType;
  label: string;
  // The mark on the page's timeline, in words for tooltips and the legend.
  mark: string;
  usedFor: string;
}[] = [
  {
    value: "meeting",
    label: "Meeting",
    mark: "filled circle",
    usedFor: "Customer, prospect and partner meetings; internal briefings",
  },
  {
    value: "stand",
    label: "Stand & setup",
    mark: "hollow circle",
    usedFor: "Badge collection, stand build, stand shifts, pack-down, deliveries",
  },
  {
    value: "meal",
    label: "Meal / networking",
    mark: "square",
    usedFor: "Customer dinners, receptions, networking events",
  },
  {
    value: "session",
    label: "Session / speaking",
    mark: "diamond",
    usedFor: "Keynotes, panels, conference sessions, speaking slots",
  },
];

export function itemTypeLabel(type: ItineraryItemType): string {
  return ITINERARY_ITEM_TYPES.find((t) => t.value === type)?.label ?? type;
}

// The statement every itinerary carries. Travel stays off the day
// timelines; the page has its own section where each attendee records
// what they've booked, so the team can see who arrives when.
export const TRAVEL_STATEMENT =
  "Each attendee books and manages their own flights, accommodation and transfers, and records them in the Travel and accommodation section so the team knows who's arriving when and where everyone is staying.";

// The notes under every itinerary page.
export const ITINERARY_FOOTER = [
  "Built from the event program and the calendar invites. Where the two differ, this page follows the invites, which include later changes.",
  "Travel and accommodation are booked by each attendee; the details on this page are what they’ve entered themselves.",
  "Plans move. Check the invite for the latest time.",
];

// What the organiser confirms by hand before sending; the automatic checks
// are in itineraryChecks below.
export const MANUAL_CHECKS: { id: string; label: string }[] = [
  { id: "weekdays", label: "Every date in the strip shows the right weekday." },
  {
    id: "times",
    label: "Stand, session and meeting times checked against the event program and invites.",
  },
  {
    id: "venue",
    label: "Venue, hall and stand number checked against the organiser’s confirmation.",
  },
  { id: "names", label: "Every name and contact detail checked against the originals." },
  { id: "travel", label: "Attendees know to book their own travel and accommodation." },
  { id: "devices", label: "Saved file opened on a phone and a computer." },
];

// Default colours for cities, in turn. Brand steps dark enough for white
// text on the day headings.
export const CITY_COLORS = ["#371ee1", "#1f7a4d", "#b4501f", "#a3294d", "#2f6fb0", "#244349"];

export function newItineraryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyRow(label = "", value = "", note = ""): ItineraryRow {
  return { id: newItineraryId("row"), label, value, note };
}

export function emptyItem(type: ItineraryItemType = "meeting"): ItineraryItem {
  return {
    id: newItineraryId("it"),
    start: "",
    end: "",
    type,
    title: "",
    details: "",
    attending: "",
    also: "",
  };
}

// Every YYYY-MM-DD from `from` to `to` inclusive.
export function eachDay(from: string, to: string): string[] {
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`).getTime();
  // Guard against a mistyped range spanning years.
  while (d.getTime() <= end && out.length < 60) {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    out.push(local.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// "Miami, US" → "Miami"; "Japan, Tokyo Big Sight" → "Japan". The first
// part before a comma, which is the city in nearly every record.
export function cityFromLocation(location: string | undefined): string {
  if (!location) return "";
  return location.split(/[,–-]/)[0].trim();
}

// Names from a free-text attendee list, when it reads as a plain list
// ("SJ Kim  Brett Wilton Martin Lee" doesn't; "Harry Liu, Li Liu" does).
// Returns [] when the text is better kept as a note for a person to sort.
export function namesFromList(text: string | undefined): string[] {
  if (!text) return [];
  const parts = text
    .split(/[,;\n\t]|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 10) return [];
  if (parts.some((p) => p.length > 40 || /\d/.test(p))) return [];
  return parts;
}

// A first draft of the itinerary from what the event already knows: a day
// per date of the run, the stand open on each if we have one, the speaking
// slot, the venue, the leads and the attendees. Everything is there to be
// edited; nothing about travel or accommodation is ever added.
export function draftItinerary(event: MarketingEvent): EventItinerary {
  const city = cityFromLocation(event.location);
  const cities = city ? [{ id: newItineraryId("city"), name: city, color: CITY_COLORS[0] }] : [];

  const attendees: ItineraryRow[] = [];
  if (event.marketingLead) attendees.push(emptyRow(event.marketingLead, "Marketing lead"));
  if (event.salesLead && event.salesLead !== event.marketingLead) {
    attendees.push(emptyRow(event.salesLead, "Sales lead"));
  }
  const names = namesFromList(event.salesAttendees);
  names
    .filter((n) => !attendees.some((a) => a.label.toLowerCase() === n.toLowerCase()))
    .forEach((n) => attendees.push(emptyRow(n, "")));
  const attendeesNote =
    names.length === 0 && event.salesAttendees ? `Going: ${event.salesAttendees}` : "";

  const venue: ItineraryRow[] = [
    emptyRow("Venue", "", event.location ?? ""),
    emptyRow(
      "Stand",
      event.booth ? event.boothNote || "Yes" : event.attendAndSell ? "No stand — attending to sell" : "",
      "",
    ),
    emptyRow("Opening hours", "", ""),
    emptyRow("Badge collection", "", ""),
  ];

  const dates = eachDay(event.startDate, event.endDate);
  const days: ItineraryDay[] = dates.map((date, i) => {
    const items: ItineraryItem[] = [];
    if (event.booth) {
      items.push({ ...emptyItem("stand"), title: "Stand open" });
    }
    if (i === 0 && event.speakingOpportunity) {
      items.push({
        ...emptyItem("session"),
        title: "Speaking slot",
        details: event.speakingOpportunity,
      });
    }
    return {
      date,
      city,
      title: dates.length === 1 ? "" : `Day ${i + 1}`,
      note: "",
      items,
    };
  });

  return {
    headerLine: event.location ?? "",
    cities,
    attendees,
    attendeesNote,
    venue,
    contacts: [],
    standShifts: [],
    shipping: [],
    days,
    manualChecks: [],
    updatedAt: new Date().toISOString(),
  };
}

// Words that mean the item is travel or accommodation, which the itinerary
// doesn't cover.
const TRAVEL_WORDS =
  /\b(flights?|fly|flying|airport|airline|boarding|hotel|accommodation|check[- ]?in|check[- ]?out|transfer|taxi|uber|shuttle|train|rail|departure|arrival|lands?|take[- ]?off)\b/i;

export type ItineraryCheck = {
  id: string;
  label: string;
  ok: boolean;
  // What's wrong, when it isn't ok.
  detail: string;
};

export function itineraryChecks(it: EventItinerary, event: MarketingEvent): ItineraryCheck[] {
  const eventDays = eachDay(event.startDate, event.endDate);
  const planned = new Set(it.days.map((d) => d.date));
  const missingDays = eventDays.filter((d) => !planned.has(d));
  const emptyDays = it.days.filter((d) => d.items.length === 0).map((d) => d.date);
  const dayDetail = [
    missingDays.length ? `not in the plan: ${missingDays.join(", ")}` : "",
    emptyDays.length ? `nothing on: ${emptyDays.join(", ")}` : "",
    eventDays.length === 0 ? "the event's dates are TBC" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const venueRow = it.venue.find((r) => /venue/i.test(r.label));
  const standRow = it.venue.find((r) => /stand|booth/i.test(r.label));
  const venueOk = !!venueRow?.value.trim() && !!standRow?.value.trim();

  const travel: string[] = [];
  it.days.forEach((d) => {
    if (TRAVEL_WORDS.test(d.note)) travel.push(`${d.date} note`);
    d.items.forEach((i) => {
      if (TRAVEL_WORDS.test(`${i.title} ${i.details}`)) travel.push(i.title || `${d.date} item`);
    });
  });

  const known = new Set(it.attendees.map((a) => a.label.trim().toLowerCase()).filter(Boolean));
  const unknown = new Set<string>();
  it.days.forEach((d) =>
    d.items.forEach((i) =>
      i.attending
        .split(/[,;]/)
        .map((n) => n.trim())
        .filter(Boolean)
        .forEach((n) => {
          if (!known.has(n.toLowerCase())) unknown.add(n);
        }),
    ),
  );

  const badCities = it.cities.filter(
    (c) => !c.name.trim() || !/^#[0-9a-fA-F]{3,8}$/.test(c.color),
  );
  const cityless = it.days.filter(
    (d) => d.city && !it.cities.some((c) => c.name.trim() === d.city.trim()),
  );

  return [
    {
      id: "days",
      label: "Every day of the event is in the date strip and has something on it",
      ok: eventDays.length > 0 && missingDays.length === 0 && emptyDays.length === 0,
      detail: dayDetail,
    },
    {
      id: "venue",
      label: "Venue and stand details are filled in",
      ok: venueOk,
      detail: venueOk ? "" : "fill in the Venue and Stand lines",
    },
    {
      id: "travel",
      label: "No travel or accommodation on the day timelines",
      ok: travel.length === 0,
      detail: travel.length
        ? `looks like travel: ${travel.join(", ")} — attendees record theirs in the page's Travel section`
        : "",
    },
    {
      id: "names",
      label: "Names on Attending lines match “Who’s attending”",
      ok: unknown.size === 0,
      detail: unknown.size ? `not in the list: ${Array.from(unknown).join(", ")}` : "",
    },
    {
      id: "cities",
      label: "Each city has a name and a colour",
      ok: badCities.length === 0 && cityless.length === 0,
      detail: [
        badCities.length ? `${badCities.length} without a name or colour` : "",
        cityless.length ? `days in a city not listed: ${cityless.map((d) => d.city).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

// "09:30" → "9:30am"; "" → "".
export function formatTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm.trim();
  const h = Number(m[1]);
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m[2]}${suffix}`;
}

export function formatTimeRange(start: string, end: string): string {
  const a = formatTime(start);
  const b = formatTime(end);
  if (a && b) return `${a}–${b}`;
  return a || b || "All day";
}

// Items in time order; untimed ones first, as all-day things.
export function sortItems(items: ItineraryItem[]): ItineraryItem[] {
  return items
    .slice()
    .sort((a, b) => (a.start || "00:00").localeCompare(b.start || "00:00"));
}

// Which sections a reader will see, for the editor's summary line.
export function itinerarySummary(it: EventItinerary): string {
  const items = it.days.reduce((n, d) => n + d.items.length, 0);
  return `${it.days.length} day${it.days.length === 1 ? "" : "s"} · ${items} item${
    items === 1 ? "" : "s"
  } · ${it.attendees.length} attending`;
}

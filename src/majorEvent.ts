import type { KitCore, KitValue, MajorEventKit, MarketingEvent } from "./types";
import { EVENT_STATUSES, emptyChecklist } from "./events";
import {
  kitState,
  newKitId,
  setKitRoot,
  type Ctx,
  type FieldSpec,
  type KeyDate,
  type KindSpec,
  type KitDef,
  type KitState,
  type SectionSpec,
} from "./webinarKit";

// The WiseTech Global Major Event Workflow, as a workspace on an event. A
// major event is one the company hosts itself: around 400 in-person
// guests, with a livestream and a recording, planned 12 to 16 weeks out.
// It is an event (it sits on the Events page and calendar like any other)
// whose page is the workflow's twelve sections instead of the trade-show
// checklist: each section owned by a role, due a set number of weeks
// before or after the event, and made of the workflow's tasks.
//
// The engine is the webinar kit's (webinarKit.ts). This file is the
// outline (roles, the twelve sections and when each is due) and the
// helpers that tie the kit to its event: everything the Events list and
// the app shell need. What is inside each section (its tasks, fields and
// repeatable rows) is in majorEventKit.ts, which only the major event's
// own page loads, so it stays out of the main bundle. No React.

export const MAJOR_EVENT_LABEL = "WiseTech Global Major Event";

// ── Roles ───────────────────────────────────────────────────────────────

const ROLES: KitDef["roles"] = {
  eventLead: { label: "Event Lead", short: "Event Lead", hint: "Accountable end to end; makes the doors decision" },
  sponsor: { label: "Executive Sponsor", short: "Sponsor", hint: "Approves the brief, the budget and changes in scope" },
  venue: { label: "Venue Lead", short: "Venue", hint: "Venue, layouts, seating, catering and handback" },
  finance: { label: "Finance / Procurement", short: "Finance", hint: "Contracts, purchase orders, payments and invoices" },
  execLiaison: { label: "Executive Liaison", short: "Exec Liaison", hint: "Executives, Board members and their Executive Assistants" },
  programme: { label: "Programme Lead", short: "Programme", hint: "Sessions, speakers and approved content" },
  pmm: { label: "Product Marketing Manager", short: "PMM", hint: "Positioning, priority messages and proof points" },
  production: { label: "Production Lead", short: "Production", hint: "Stage, AV, livestream and recording" },
  web: { label: "Web Lead", short: "Web", hint: "Event page and watch page" },
  registration: { label: "Registration Lead", short: "Registration", hint: "Registration paths, check-in and badges" },
  comms: { label: "Communications Lead", short: "Comms", hint: "Tone, claims, approvals and attendee updates" },
  social: { label: "Social Lead", short: "Social", hint: "Organic social and DSMN8 employee advocacy" },
  email: { label: "Email Marketing Lead", short: "Email", hint: "EDMs, audiences and reminders" },
  design: { label: "Design Lead", short: "Design", hint: "Branding, signage and print" },
  guest: { label: "Guest Experience Lead", short: "Guest Exp", hint: "Arrivals, ushers, access and seating on the day" },
  showCaller: { label: "Show Caller", short: "Show Caller", hint: "Calls every cue on the day" },
};

// ── The twelve sections ─────────────────────────────────────────────────
// Who owns each and when it is due, counted from the event's first day
// ("live") or its last ("end"). The titles are the workflow's own.

export type MajorSectionOutline = Omit<SectionSpec, "fields" | "reqs">;

export const MAJOR_SECTIONS: MajorSectionOutline[] = [
  {
    k: "brief", n: 1, title: "Event brief and budget", short: "Brief & budget", owner: "eventLead", with: ["sponsor"],
    timing: "12–16 weeks out", start: { a: "live", w: -16 }, due: { a: "live", w: -12 },
    intro: "Agree what the event is for, who it is for and what it costs before anything is booked. Count speakers, staff and suppliers separately from guests when confirming capacity and catering.",
  },
  {
    k: "contracts", n: 2, title: "Venue and supplier contracts", short: "Contracts", owner: "venue", with: ["finance"],
    timing: "10–14 weeks out", start: { a: "live", w: -14 }, due: { a: "live", w: -10 },
    intro: "Choose the venue, scope every supplier and get contracts and purchase orders in place before any work starts. Use the contracted dates for supplier deadlines and catering guarantees.",
    filesHint: "Floor plans, capacity confirmations, quotes and executed contracts.",
  },
  {
    k: "attendance", n: 3, title: "Executive Board and speaker attendance", short: "Attendance", owner: "eventLead", with: ["execLiaison"],
    timing: "10–14 weeks out", start: { a: "live", w: -14 }, due: { a: "live", w: -10 },
    intro: "Who is expected, who has confirmed, and whether calendars, travel and Security review are in hand for each executive and Board member.",
  },
  {
    k: "content", n: 4, title: "Product content and asset approvals", short: "Content", owner: "programme", with: ["pmm", "comms", "design"],
    timing: "8–10 weeks out through rehearsal", start: { a: "live", w: -10 }, due: { a: "live", w: -1 },
    intro: "Gather what each session needs, get the claims verified, and take every asset through Communications and Design before it reaches production.",
    filesHint: "Decks, speaker notes, MC scripts, demos, backup videos, graphics and handouts.",
  },
  {
    k: "production", n: 5, title: "Production company stage and broadcast", short: "Production", owner: "production", with: ["venue"],
    timing: "8–12 weeks out", start: { a: "live", w: -12 }, due: { a: "live", w: -8 },
    intro: "Brief the production company, specify the stage, the stream and the recording, name the crew and prove the backups work.",
    filesHint: "The production brief, itemised quote, stage plan and rehearsal notes.",
  },
  {
    k: "web", n: 6, title: "Event website and registration", short: "Website", owner: "web", with: ["registration", "comms"],
    timing: "8–10 weeks out", start: { a: "live", w: -10 }, due: { a: "live", w: -8 },
    intro: "The event page, the in-person and online registration paths, and everything a guest receives after they register.",
  },
  {
    k: "promo", n: 7, title: "Pre and post event promotion", short: "Promotion", owner: "comms", with: ["social", "email"],
    timing: "6–9 weeks out through close-out", start: { a: "live", w: -9 }, due: { a: "end", d: 15 },
    intro: "One campaign calendar across EDMs, organic social and DSMN8, from the save-the-date to the on-demand recording.",
  },
  {
    k: "assets", n: 8, title: "Physical assets and signage", short: "Signage", owner: "design", with: ["venue"],
    timing: "4–6 weeks out", start: { a: "live", w: -6 }, due: { a: "live", w: -4 },
    intro: "Everything printed or built for the venue: what, how many, where it goes, who installs it and who takes it away.",
    filesHint: "Artwork specs, proofs and the install and collection plan.",
  },
  {
    k: "seating", n: 9, title: "Seating arrivals and catering", short: "Seating & catering", owner: "venue", with: ["guest"],
    timing: "2–4 weeks out", start: { a: "live", w: -4 }, due: { a: "live", w: -2 },
    intro: "Where people sit, how they get in, and what they eat. Submit guaranteed numbers by the contracted deadline.",
    filesHint: "The seating plan, the check-in plan and the caterer's confirmations.",
  },
  {
    k: "ready", n: 10, title: "Final readiness and event day support", short: "Readiness", owner: "eventLead", with: ["showCaller"],
    timing: "Final week and event day, with the workstream leads", start: { a: "live", w: -1 }, due: { a: "live", d: 0, exact: true },
    intro: "The final event pack, the briefing, the readiness review and the walk-through, then the decision to open the doors.",
    filesHint: "The final event pack: run of show, floor plans, cue sheets, seating plan, staff roster and contacts.",
  },
  {
    k: "show", n: 11, title: "Event day run of show", short: "Run of show", owner: "showCaller", with: ["eventLead", "venue", "production", "registration"],
    timing: "Event day", start: { a: "live", d: 0, exact: true }, due: { a: "end", d: 0, exact: true },
    intro: "The day, cue by cue. The example timings are a starting point: adjust them to the venue, the agenda and the supplier call times.",
  },
  {
    k: "close", n: 12, title: "Follow up and close out", short: "Close-out", owner: "eventLead", with: ["comms", "finance"],
    timing: "1–15 days after", start: { a: "end", d: 1 }, due: { a: "end", d: 15 },
    intro: "Reconcile the numbers, send the follow-ups, check what was delivered, pay what is owed and record what to do differently.",
    filesHint: "The event report, final invoices, approved recordings and the archived run of show.",
  },
];

// The Event details card on the Overview. All project-level: the name,
// status, venue and dates are the event's own; the links sit on the kit.
const OV_FIELDS: FieldSpec[] = [
  { k: "name", p: true, t: "text", label: "Event name" },
  { k: "status", p: true, t: "select", label: "Status", opts: EVENT_STATUSES.map((s): [string, string] => [s.value, s.label]), half: true },
  { k: "location", p: true, t: "text", label: "Venue", ph: "Venue and city", half: true },
  { k: "startDate", p: true, t: "date", label: "First day", half: true, hint: "Every section's due date is counted from the event's dates." },
  { k: "endDate", p: true, t: "date", label: "Last day", half: true },
  { k: "folder", p: true, t: "url", label: "Project folder (SharePoint)" },
  { k: "tracker", p: true, t: "url", label: "Shared task tracker", hint: "If approvals and links are also recorded outside Waypoint." },
];

// The fields above that are the event's own, not the kit's.
const EVENT_ROOT_KEYS = new Set(["name", "status", "location", "startDate", "endDate"]);

const sv = (x: unknown) => (typeof x === "string" ? x : "");

// A definition over the outline: the given sections (with or without
// their contents) and repeatable rows, and everything else the same.
export function majorDef(sections: SectionSpec[], kinds: Record<string, KindSpec>): KitDef {
  return {
    id: "major",
    sections,
    secByKey: Object.fromEntries(sections.map((s) => [s.k, s])),
    roles: ROLES,
    kinds,
    links: {},
    ovFields: OV_FIELDS,
    leadRole: "eventLead",
    anchors: (k) => {
      const kit = k as MajorEventKit;
      return { live: kit.goLive || "", end: kit.end || kit.goLive || "" };
    },
    // The workflow's lead times are used as written.
    scale: () => 1,
    keyDates: (k) => {
      const kit = k as MajorEventKit;
      const v = (sec: string, key: string) => sv(kit.values[sec]?.[key]);
      const out: KeyDate[] = [];
      if (v("web", "rsvp")) out.push({ d: v("web", "rsvp"), label: "RSVP deadline", cls: "rec" });
      if (v("seating", "deadline")) out.push({ d: v("seating", "deadline"), label: "Catering guarantee", cls: "rec" });
      if (v("production", "rehearsal")) out.push({ d: v("production", "rehearsal"), label: "Rehearsal", cls: "rec" });
      if (v("ready", "reviewDate")) out.push({ d: v("ready", "reviewDate"), label: "Readiness review", cls: "rec" });
      if (kit.goLive) out.push({ d: kit.goLive, label: kit.end && kit.end !== kit.goLive ? "First day" : "Event day", cls: "" });
      if (kit.end && kit.end !== kit.goLive) out.push({ d: kit.end, label: "Last day", cls: "" });
      return out;
    },
    legend: [
      { cls: "rec", label: "Deadlines and rehearsals" },
      { cls: "", label: "Event day" },
    ],
    noun: "major event",
    anchorLabel: "event date",
  };
}

// The workflow without what is inside its sections: enough for the
// schedule, each section's status and progress across the twelve.
export const MAJOR_OUTLINE: KitDef = majorDef(
  MAJOR_SECTIONS.map((s) => ({ ...s, fields: [], reqs: () => [] })),
  {},
);

// ── The kit on its event ────────────────────────────────────────────────

export function isMajorEvent(e: Pick<MarketingEvent, "major">): boolean {
  return !!e.major;
}

export function emptyMajorKit(defaults: Partial<MajorEventKit> = {}): MajorEventKit {
  const now = new Date().toISOString();
  return {
    goLive: "",
    end: "",
    folder: "",
    tracker: "",
    team: {},
    sec: {},
    values: {},
    items: [],
    files: [],
    notes: [],
    activity: [],
    createdAt: now,
    updatedAt: now,
    ...defaults,
  };
}

// The kit as the page works with it, with the event's dates on it: they
// are the event's to change (from here, or from its Details tab), so the
// stored copies are never trusted on their own.
export function majorKitOf(e: MarketingEvent): MajorEventKit | null {
  if (!e.major) return null;
  return { ...e.major, goLive: e.startDate || "", end: e.endDate || e.startDate || "" };
}

// The event with a new kit on it, the kit's dates brought into line.
export function withMajorKit(e: MarketingEvent, kit: KitCore): MarketingEvent {
  return {
    ...e,
    major: {
      ...(kit as MajorEventKit),
      goLive: e.startDate || "",
      end: e.endDate || e.startDate || "",
      updatedAt: new Date().toISOString(),
    },
  };
}

// Where a major event's workflow stands: sections done, overdue, next.
export function majorState(e: MarketingEvent, today?: string): KitState | null {
  const kit = majorKitOf(e);
  return kit ? kitState(kit, today, MAJOR_OUTLINE) : null;
}

// A project-level value of a major event: the event's own for its name,
// status, venue and dates, the kit's for the rest.
export function majorRoot(e: MarketingEvent, kit: KitCore): Ctx["root"] {
  return (key) =>
    EVENT_ROOT_KEYS.has(key)
      ? (e as unknown as Record<string, KitValue | undefined>)[key]
      : (kit as unknown as Record<string, KitValue | undefined>)[key];
}

// Save a project-level value: onto the event or the kit, whichever owns
// it. Changing the first day moves the last day along with it when the
// run would otherwise end before it starts, and files the event under the
// new year; clearing it puts the dates back to TBC.
export function setMajorRoot(e: MarketingEvent, kit: KitCore, key: string, value: KitValue | undefined): MarketingEvent {
  if (!EVENT_ROOT_KEYS.has(key)) return withMajorKit(e, setKitRoot(kit, key, value));
  const text = typeof value === "string" ? value : "";
  let next = e;
  if (key === "name") next = { ...e, name: text.trim() || e.name };
  else if (key === "status") next = { ...e, status: (text || e.status) as MarketingEvent["status"] };
  else if (key === "location") next = { ...e, location: text.trim() || undefined };
  else if (key === "startDate") {
    next = text
      ? { ...e, startDate: text, endDate: !e.endDate || e.endDate < text ? text : e.endDate, year: Number(text.slice(0, 4)), tbcMonth: undefined }
      : { ...e, startDate: "", endDate: "" };
  } else if (key === "endDate") {
    if (!text) next = { ...e, endDate: e.startDate };
    else if (!e.startDate) next = { ...e, startDate: text, endDate: text, year: Number(text.slice(0, 4)), tbcMonth: undefined };
    else next = { ...e, endDate: text < e.startDate ? e.startDate : text };
  }
  return withMajorKit(next, kit);
}

// A new major event: an event document with the kit on it and the regular
// checklist left blank (a major event doesn't use it).
export function newMajorEvent(input: {
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  division: string;
  lead?: string;
  leadName?: string;
  inPerson?: number;
  online?: number;
  by: string;
}): MarketingEvent {
  const now = new Date().toISOString();
  const brief: Record<string, KitValue> = {};
  if (input.inPerson) brief.tInPerson = input.inPerson;
  if (input.online) brief.tOnline = input.online;
  const kit = emptyMajorKit({
    lead: input.lead || undefined,
    team: input.lead ? { eventLead: [input.lead] } : {},
    values: Object.keys(brief).length ? { brief } : {},
    activity: [{ id: newKitId("a"), section: "", what: "created the major event", by: input.by, at: now }],
  });
  const start = input.startDate;
  const end = start ? (input.endDate && input.endDate >= start ? input.endDate : start) : "";
  return withMajorKit(
    {
      id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name.trim(),
      status: "planning",
      year: start ? Number(start.slice(0, 4)) : new Date().getFullYear(),
      startDate: start,
      endDate: end,
      division: input.division,
      location: input.location.trim() || undefined,
      marketingLead: input.leadName || undefined,
      projectIds: [],
      checklist: emptyChecklist(),
      createdAt: now,
      source: "manual",
    },
    kit,
  );
}

import type {
  Designer,
  LiveEventBlackout,
  LiveEventRequest,
  LiveEventRequestStatus,
  PublicBlackout,
} from "./types";
import { todayIso } from "./dates";
import type { WpTone } from "./statusTone";

// Helpers for the Live event requests panel: what the SharePoint form
// captured (its `json`), read back into a LiveEventSubmission, and the
// derived lines the panel and its review modal show. The vocabulary (the
// audience types, the access levels, the flags for the team's attention)
// is the form's own, kept in step with src/liveEventRequestForm.template
// .html, so a request reads the same here as it did to the requester.

export type PreSpeaker = { name: string; based: string; unconfirmed: boolean };

// One submission, as the form's `blank()` record plus the requester's
// details. Every pick is stored as the option's label.
export type LiveEventSubmission = {
  name: string;
  email: string;
  team: string;
  primaryContact: string;
  contactName: string;
  contactEmail: string;
  eventName: string;
  date: string;
  time: string;
  endTime: string;
  dateUnc: boolean;
  dateTbc: boolean;
  timeTbc: boolean;
  endTbc: boolean;
  inPerson: string;
  online: string;
  onlineWho: string;
  audienceType: string;
  room: string;
  access: string;
  speakers: string;
  speakerNames: string[];
  mics: string[];
  content: string[];
  preCount: string;
  preSpeakers: PreSpeaker[];
  preSupport: boolean;
  dialIn: string;
  slideControl: string;
  script: string;
  qa: string;
  qaMod: string;
  moderation: string;
  modName: string;
  timer: string;
  teamsConfirm: boolean;
  deliverables: string;
  publishWhen: string;
  publishTbc: boolean;
  publishWhere: string[];
  facilitiesAck: boolean;
  notes: string;
  createdAt: string;
};

export const AUDIENCE = {
  live: "Live Audience only (Sydney)",
  hybrid: "Live Audience with Online Stream (hosted from Sydney)",
  out: "Live Audience (not hosted in Sydney)",
  online: "Online-Only audience",
} as const;

const AUDIENCE_SHORT: Record<string, string> = {
  [AUDIENCE.live]: "Live only (Sydney)",
  [AUDIENCE.hybrid]: "Live + online stream",
  [AUDIENCE.out]: "Live, not in Sydney",
  [AUDIENCE.online]: "Online only",
};

const ACCESS_LABELS: Record<string, string> = {
  Public: "Public (anyone with the link can join)",
  Internal: "Internal (company SSO login to join)",
  "Registration required":
    "Registration required (an online registration portal to capture audience information)",
  "Curated Invite List":
    "Curated Invite List (you supply us a CSV of the name and email for every audience member)",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function bool(v: unknown): boolean {
  return v === true || v === "true";
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((s) => s.trim()) : [];
}

// A tolerant read of the form's JSON: anything missing or malformed comes
// back empty rather than throwing, so one odd submission can't take the
// panel down.
export function parseSubmission(json: string): LiveEventSubmission {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    // Fall through to the empty submission.
  }
  const pre = Array.isArray(raw.preSpeakers) ? (raw.preSpeakers as unknown[]) : [];
  return {
    name: str(raw.name),
    email: str(raw.email),
    team: str(raw.team),
    primaryContact: str(raw.primaryContact),
    contactName: str(raw.contactName),
    contactEmail: str(raw.contactEmail),
    eventName: str(raw.eventName),
    date: str(raw.date),
    time: str(raw.time),
    endTime: str(raw.endTime),
    dateUnc: bool(raw.dateUnc),
    dateTbc: bool(raw.dateTbc),
    timeTbc: bool(raw.timeTbc),
    endTbc: bool(raw.endTbc),
    inPerson: str(raw.inPerson),
    online: str(raw.online),
    onlineWho: str(raw.onlineWho),
    audienceType: str(raw.audienceType),
    room: str(raw.room),
    access: str(raw.access),
    speakers: str(raw.speakers),
    speakerNames: strList(raw.speakerNames),
    mics: strList(raw.mics),
    content: strList(raw.content),
    preCount: str(raw.preCount),
    preSpeakers: pre.map((p) => {
      const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return { name: str(o.name), based: str(o.based), unconfirmed: bool(o.unconfirmed) };
    }),
    preSupport: bool(raw.preSupport),
    dialIn: str(raw.dialIn),
    slideControl: str(raw.slideControl),
    script: str(raw.script),
    qa: str(raw.qa),
    qaMod: str(raw.qaMod),
    moderation: str(raw.moderation),
    modName: str(raw.modName),
    timer: str(raw.timer),
    teamsConfirm: bool(raw.teamsConfirm),
    deliverables: str(raw.deliverables),
    publishWhen: str(raw.publishWhen),
    publishTbc: bool(raw.publishTbc),
    publishWhere: strList(raw.publishWhere),
    facilitiesAck: bool(raw.facilitiesAck),
    notes: str(raw.notes),
    createdAt: str(raw.createdAt),
  };
}

// "Tuesday, 3 November 2026", or the raw value if it isn't a date.
export function formatRequestDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// "Tue 3 Nov", for cards.
export function formatRequestDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function submissionDateLabel(s: LiveEventSubmission, short = false): string {
  if (s.dateTbc || !s.date) return "Date to be confirmed";
  const base = short ? formatRequestDateShort(s.date) : formatRequestDate(s.date);
  return s.dateUnc ? `${base} (not confirmed)` : base;
}

export function submissionTimeLabel(s: LiveEventSubmission): string {
  const start = !s.timeTbc && s.time ? s.time : "";
  const end = !s.endTbc && s.endTime ? s.endTime : "";
  if (start && end) return `${start} – ${end}`;
  if (start && s.endTbc) return `${start} – TBC`;
  if (end) return `TBC – ${end}`;
  if (start) return start;
  return "Time to be confirmed";
}

export function audienceShort(s: LiveEventSubmission): string {
  return AUDIENCE_SHORT[s.audienceType] ?? s.audienceType;
}

// "Events Space · Live + online stream"
export function whereLabel(s: LiveEventSubmission): string {
  return [s.room, audienceShort(s)].filter(Boolean).join(" · ") || "To be confirmed";
}

export function deliverableShort(s: LiveEventSubmission): string {
  if (s.deliverables === "Both") return "Live stream + on-demand edit";
  return s.deliverables || "—";
}

function externalOnline(s: LiveEventSubmission): boolean {
  return s.onlineWho === "External only" || s.onlineWho === "Both internal & external";
}
function wantsOnDemand(s: LiveEventSubmission): boolean {
  return s.deliverables === "On-demand edit" || s.deliverables === "Both";
}
function speakerNames(s: LiveEventSubmission): string[] {
  return s.speakerNames.map((n) => n.trim()).filter(Boolean);
}
function preRecorded(s: LiveEventSubmission): string[] {
  return s.preSpeakers.map((p) => {
    const nm = p.name.trim();
    const who = nm ? nm + (p.unconfirmed ? " (unconfirmed)" : "") : "Unconfirmed speaker";
    return who + (p.based ? ` – based in ${p.based}` : "");
  });
}

// What the team should notice before they plan: the same list the form's
// PDF prints under "For the Live Events Team's attention".
export function attentionFlags(s: LiveEventSubmission): string[] {
  const f: string[] = [];
  if (s.dateTbc || s.timeTbc || s.endTbc) f.push("Date or time not confirmed yet");
  if (s.dateUnc && !s.dateTbc) f.push("Date is not confirmed and may change");
  if (s.audienceType === AUDIENCE.out)
    f.push("Not hosted in Sydney: on-site support is Sydney only, so a solution needs working out with the requester");
  if (externalOnline(s) && s.access === "Public") f.push("External online audience with public access");
  if ((Number(s.inPerson) || 0) + (Number(s.online) || 0) >= 500 && s.qaMod === "Not moderated")
    f.push("Large audience with unmoderated online Q&A");
  if (s.moderation === "Live Events Team") f.push("Needs a Q&A moderator from the Live Events Team");
  if (s.moderation === "Requester's team" && s.modName)
    f.push(`Add ${s.modName} to the event as a Producer (Q&A moderator)`);
  if (s.preSpeakers.some((p) => p.unconfirmed)) f.push("Unconfirmed pre-recorded speaker(s)");
  if (s.preSupport) f.push("Needs support with pre-recording: get in touch (Riverside suggested)");
  if (s.dialIn === "Yes") f.push("Dial-in needed: remote person joining live");
  if (s.slideControl === "We run the slides for you") f.push("We run the slides: collect decks in advance");
  if (s.slideControl === "Speakers control their own slides") f.push("Supply a USB slide remote");
  if (s.script === "Yes") f.push("Script or speaker notes are included in the PowerPoint");
  if (s.timer === "Yes") f.push("On-screen speaker timer required");
  if (wantsOnDemand(s) && s.publishWhere.includes("Supplied back to attendees for rewatching"))
    f.push("Recording to be supplied to attendees: internal sharing or an unlisted public link only, no private lists and no downloads");
  return f;
}

export type SubmissionSection = {
  title: string;
  rows: { label: string; value: string | string[] }[];
};

// Every answer, grouped as the form's review step groups them; empty
// answers are dropped so a section only shows what was said.
export function submissionSections(s: LiveEventSubmission, facilitiesEmail: string): SubmissionSection[] {
  const contact =
    s.primaryContact === "No"
      ? `No. Primary event contact: ${s.contactName || "–"}${s.contactEmail ? ` (${s.contactEmail})` : ""}`
      : s.primaryContact;
  const spk = s.speakers
    ? s.speakers + (speakerNames(s).length ? `: ${speakerNames(s).join(", ")}` : "")
    : "";
  const mod =
    s.moderation === "Requester's team"
      ? "Requester's team" + (s.modName ? `: ${s.modName} (to be added as a Producer)` : "")
      : s.moderation;
  const deliver =
    s.deliverables === "Both"
      ? ["Live stream: broadcast live on the day", "On-demand edit: edited recording for viewing later"]
      : s.deliverables === "Live stream"
        ? ["Live stream: broadcast live on the day"]
        : s.deliverables === "On-demand edit"
          ? ["On-demand edit: edited recording for viewing later"]
          : s.deliverables
            ? [s.deliverables]
            : [];
  const all: SubmissionSection[] = [
    {
      title: "Requester",
      rows: [
        { label: "Name", value: s.name },
        { label: "Email", value: s.email },
        { label: "Team", value: s.team },
        { label: "Primary event contact", value: contact },
      ],
    },
    {
      title: "Event",
      rows: [
        { label: "Date", value: submissionDateLabel(s) },
        { label: "Time", value: submissionTimeLabel(s) },
        { label: "In-person attendees", value: s.inPerson },
        { label: "Online attendees", value: s.online },
        { label: "Who's watching online", value: s.onlineWho },
      ],
    },
    {
      title: "Venue & access",
      rows: [
        { label: "Audience type", value: s.audienceType },
        { label: "Room", value: s.room },
        { label: "Access", value: ACCESS_LABELS[s.access] ?? s.access },
        {
          label: "Online platform",
          value: s.teamsConfirm
            ? "Microsoft Teams (confirmed by requester). The team will recommend the best platform/event type."
            : "",
        },
      ],
    },
    {
      title: "Presenters & audio",
      rows: [
        { label: "In-person speakers", value: spk },
        { label: "Mics", value: s.mics },
        { label: "On-screen speaker timer", value: s.timer },
      ],
    },
    {
      title: "Content",
      rows: [
        { label: "Includes", value: s.content },
        { label: "Pre-recorded segments", value: preRecorded(s) },
        {
          label: "Pre-recording support",
          value: s.preSupport ? "Requested. Get in touch (Riverside suggested)." : "",
        },
        { label: "Dial-in needed", value: s.dialIn },
        { label: "Slide control", value: s.slideControl },
        { label: "Script / speaker notes in PowerPoint", value: s.script },
      ],
    },
    {
      title: "Q&A",
      rows: [
        { label: "Format", value: s.qa },
        { label: "Online Q&A", value: s.qaMod },
        { label: "Moderator", value: mod },
      ],
    },
    {
      title: "Recording & delivery",
      rows: [
        { label: "Deliverables", value: deliver },
        {
          label: "On-demand needed by",
          value: wantsOnDemand(s)
            ? s.publishTbc
              ? "Not sure yet"
              : s.publishWhen
                ? formatRequestDate(s.publishWhen)
                : ""
            : "",
        },
        { label: "On-demand published to", value: wantsOnDemand(s) ? s.publishWhere : [] },
      ],
    },
    {
      title: "Facilities",
      rows: [
        {
          label: "Facilities request",
          value: s.facilitiesAck
            ? `Acknowledged: will contact ${facilitiesEmail} for catering, security, furniture hire, seating, banners or decorations`
            : "",
        },
      ],
    },
    { title: "Notes", rows: [{ label: "Notes", value: s.notes }] },
  ];
  return all
    .map((sec) => ({
      ...sec,
      rows: sec.rows.filter((r) => (Array.isArray(r.value) ? r.value.length > 0 : !!r.value)),
    }))
    .filter((sec) => sec.rows.length > 0);
}

// One line of what the day needs, for the schedule view: speakers, mics,
// slides, Q&A, deliverables.
export function setupSummary(s: LiveEventSubmission): string {
  const p: string[] = [];
  if (s.speakers)
    p.push(
      `${s.speakers} in-person speaker${s.speakers === "1" ? "" : "s"}` +
        (speakerNames(s).length ? ` (${speakerNames(s).join(", ")})` : ""),
    );
  if (s.mics.length) p.push(`Mics: ${s.mics.join(", ")}`);
  if (s.content.includes("Slideshow"))
    p.push(`Slides: ${s.slideControl || "to be confirmed"}${s.script === "Yes" ? " (script/notes in the deck)" : ""}`);
  if (s.content.includes("Videos")) p.push("Video clips");
  if (s.content.includes("Audience activities")) p.push("Audience activity");
  const pre = preRecorded(s).length;
  if (pre) p.push(`${pre} pre-recorded segment${pre === 1 ? "" : "s"}`);
  if (s.dialIn === "Yes") p.push("Remote dial-in needed");
  if (s.qa && s.qa !== "No Q&A")
    p.push(
      `Q&A: ${s.qa}` +
        (s.qaMod ? ` (${s.qaMod.toLowerCase()})` : "") +
        (s.moderation === "Requester's team" && s.modName ? `, moderator ${s.modName} as Producer` : ""),
    );
  if (s.timer === "Yes") p.push("On-screen speaker timer");
  if (s.deliverables) p.push(`Deliver: ${deliverableShort(s)}`);
  if (s.teamsConfirm) p.push("Platform: Microsoft Teams");
  if (s.online) p.push(`${s.online} online attendees`);
  return p.join(". ") || "No setup details provided.";
}

// The whole request as plain text, for copying into a brief or an email.
export function requestBrief(
  r: LiveEventRequest,
  s: LiveEventSubmission,
  facilitiesEmail: string,
): string {
  const out = [`LIVE EVENT REQUEST: ${r.eventName}`];
  submissionSections(s, facilitiesEmail).forEach((sec) => {
    out.push("", `--- ${sec.title.toUpperCase()} ---`);
    sec.rows.forEach((row) =>
      out.push(`${row.label}: ${Array.isArray(row.value) ? row.value.join("; ") : row.value}`),
    );
  });
  const flags = attentionFlags(s);
  if (flags.length) {
    out.push("", "--- FOR ATTENTION ---");
    flags.forEach((f) => out.push(`- ${f}`));
  }
  if (r.decision) {
    out.push("", `Decision: ${r.decision.status === "approved" ? "Approved" : "Declined"} by ${r.decision.decidedByName}`);
    if (r.decision.note) out.push(r.decision.note);
  }
  out.push("", `Reference: ${r.id}`);
  return out.join("\n");
}

// The team's reply to the requester, ready to paste or send; the note is
// the team's message on the decision.
export function replyEmail(
  r: LiveEventRequest,
  s: LiveEventSubmission,
  status: "approved" | "declined",
  note: string,
): { subject: string; body: string } {
  const first = (r.requesterName || "").split(" ")[0] || "there";
  const when = `${submissionDateLabel(s)}, ${submissionTimeLabel(s)}`;
  const n = note.trim() ? `\n\n${note.trim()}` : "";
  const body =
    status === "approved"
      ? `Hi ${first},\n\nGood news – your live event request "${r.eventName}" (${when}) has been approved.${n}\n\nWe'll be in touch shortly to work through how we can best support your event.\n\nKind regards,\nLive Events Team`
      : `Hi ${first},\n\nThanks for your request for "${r.eventName}" (${when}). Unfortunately we're unable to support it as submitted.${n}\n\nHappy to chat about alternatives and how we can still support you.\n\nKind regards,\nLive Events Team`;
  return { subject: `Re: Live event request – ${r.eventName}`, body };
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function outlookComposeUrl(to: string, subject: string, body: string): string {
  return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function requestStatusTone(status: LiveEventRequestStatus): WpTone {
  switch (status) {
    case "approved":
      return "live";
    case "declined":
      return "blocked";
    default:
      return "review";
  }
}

export function requestStatusLabel(status: LiveEventRequestStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    default:
      return "Pending";
  }
}

// An approved request for a date still to come (or not yet set), which is
// what the schedule filter shows.
export function requestIsUpcoming(r: LiveEventRequest, today: string): boolean {
  return r.status === "approved" && (!r.eventDate || r.eventDate >= today);
}

// Pending newest first, so the latest arrival is at the top; then approved
// by event date (undated last); then declined, newest first.
export function sortRequests(list: LiveEventRequest[]): LiveEventRequest[] {
  const rank: Record<LiveEventRequestStatus, number> = { pending: 0, approved: 1, declined: 2 };
  return list.slice().sort((a, b) => {
    const ra = rank[a.status] ?? 0;
    const rb = rank[b.status] ?? 0;
    if (ra !== rb) return ra - rb;
    if (a.status === "approved") {
      const da = a.eventDate || "9999";
      const db = b.eventDate || "9999";
      if (da !== db) return da.localeCompare(db);
    }
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

// ── No-booking periods ──

export function blackoutsOn(iso: string, blackouts: LiveEventBlackout[]): LiveEventBlackout[] {
  if (!iso) return [];
  return blackouts.filter((b) => b.start <= iso && iso <= b.end);
}

function formatBlackoutDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function blackoutRange(b: Pick<LiveEventBlackout, "start" | "end">): string {
  return b.start === b.end
    ? formatBlackoutDay(b.start)
    : `${formatBlackoutDay(b.start)} to ${formatBlackoutDay(b.end)}`;
}

// The attention line for a request whose date the team has blocked out.
export function blackoutFlag(r: LiveEventRequest, blackouts: LiveEventBlackout[]): string | null {
  const b = blackoutsOn(r.eventDate, blackouts)[0];
  if (!b) return null;
  return `Falls in a no-booking period: ${b.reason || "no bookings"} (${blackoutRange(b)})`;
}

// What the form gets: the periods still ahead, dates and reason only.
export function publicBlackouts(blackouts: LiveEventBlackout[]): PublicBlackout[] {
  const today = todayIso();
  return blackouts
    .filter((b) => b.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(({ start, end, reason }) => ({ start, end, reason }));
}

// ── Events the team adds themselves ──

export type TeamEventInput = {
  eventName: string;
  date: string;
  time: string;
  endTime: string;
  room: string;
  audienceType: string;
  inPerson: string;
  online: string;
  forName: string;
  forEmail: string;
  forTeam: string;
  notes: string;
};

// A team-added event in the form's own shape, so the panel, calendar and
// review modal read it through the same code as a submission. What the
// team didn't say is left empty, the way an unanswered form field would be.
export function teamEventJson(input: TeamEventInput, by: Designer, createdAt: string): string {
  const s: Partial<LiveEventSubmission> = {
    name: input.forName || by.name,
    email: input.forEmail,
    team: input.forTeam,
    primaryContact: "Yes",
    eventName: input.eventName,
    date: input.date,
    time: input.time,
    endTime: input.endTime,
    dateUnc: false,
    dateTbc: !input.date,
    timeTbc: !input.time,
    endTbc: !input.endTime,
    inPerson: input.inPerson,
    online: input.online,
    audienceType: input.audienceType,
    room: input.room,
    notes: input.notes,
    createdAt,
  };
  return JSON.stringify(s);
}

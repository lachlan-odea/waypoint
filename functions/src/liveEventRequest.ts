// A live event request as the SharePoint form wrote it: the `json` field
// of a /liveEventRequests document, read back tolerantly, and the lines
// the new-request email shows. Keep in step with src/liveEventRequests.ts
// (parseSubmission, submissionDateLabel, submissionTimeLabel, whereLabel,
// setupSummary, attentionFlags) and the form itself.

export type LiveEventRequestDoc = {
  json?: string;
  eventName?: string;
  requesterName?: string;
  requesterEmail?: string;
  eventDate?: string;
  createdAt?: string;
  status?: string;
  source?: "form" | "team";
};

export type LiveEventIntakeDoc = {
  teamEmail?: string;
};

// Keep in step with LIVE_EVENTS_TEAM_EMAIL in src/constants.ts.
export const LIVE_EVENTS_TEAM_EMAIL = "Liveevents@wisetechglobal.com";

type PreSpeaker = { name: string; based: string; unconfirmed: boolean };

export type Submission = {
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
  notes: string;
};

const AUDIENCE_OUT = "Live Audience (not hosted in Sydney)";
const AUDIENCE_SHORT: Record<string, string> = {
  "Live Audience only (Sydney)": "Live only (Sydney)",
  "Live Audience with Online Stream (hosted from Sydney)": "Live + online stream",
  [AUDIENCE_OUT]: "Live, not in Sydney",
  "Online-Only audience": "Online only",
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

export function parseSubmission(json: string | undefined): Submission {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(json ?? "");
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    // An unreadable submission still gets an email, from the headline fields.
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
    notes: str(raw.notes),
  };
}

// "Tuesday, 3 November 2026", or the raw value if it isn't a date.
function formatRequestDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "Tue 3 Nov", for the subject line.
export function formatRequestDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function dateLabel(s: Submission): string {
  if (s.dateTbc || !s.date) return "Date to be confirmed";
  const base = formatRequestDate(s.date);
  return s.dateUnc ? `${base} (not confirmed)` : base;
}

export function timeLabel(s: Submission): string {
  const start = !s.timeTbc && s.time ? s.time : "";
  const end = !s.endTbc && s.endTime ? s.endTime : "";
  if (start && end) return `${start} – ${end}`;
  if (start && s.endTbc) return `${start} – TBC`;
  if (end) return `TBC – ${end}`;
  if (start) return start;
  return "Time to be confirmed";
}

export function whereLabel(s: Submission): string {
  const audience = AUDIENCE_SHORT[s.audienceType] ?? s.audienceType;
  return [s.room, audience].filter(Boolean).join(" · ") || "To be confirmed";
}

// "120 in person, 300 online (internal & external)".
export function audienceLabel(s: Submission): string {
  const parts: string[] = [];
  if (s.inPerson) parts.push(`${s.inPerson} in person`);
  if (s.online) parts.push(`${s.online} online${s.onlineWho ? ` (${s.onlineWho.toLowerCase()})` : ""}`);
  return parts.join(", ");
}

export function deliverableLabel(s: Submission): string {
  if (s.deliverables === "Both") return "Live stream + on-demand edit";
  return s.deliverables;
}

export function publishLabel(s: Submission): string {
  const when = s.publishTbc ? "timing TBC" : s.publishWhen;
  return [when, s.publishWhere.join(", ")].filter(Boolean).join("; ");
}

function externalOnline(s: Submission): boolean {
  return s.onlineWho === "External only" || s.onlineWho === "Both internal & external";
}
function wantsOnDemand(s: Submission): boolean {
  return s.deliverables === "On-demand edit" || s.deliverables === "Both";
}
function speakerNames(s: Submission): string[] {
  return s.speakerNames.map((n) => n.trim()).filter(Boolean);
}

export function setupSummary(s: Submission): string {
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
  const pre = s.preSpeakers.length;
  if (pre) p.push(`${pre} pre-recorded segment${pre === 1 ? "" : "s"}`);
  if (s.dialIn === "Yes") p.push("Remote dial-in needed");
  if (s.qa && s.qa !== "No Q&A")
    p.push(
      `Q&A: ${s.qa}` +
        (s.qaMod ? ` (${s.qaMod.toLowerCase()})` : "") +
        (s.moderation === "Requester's team" && s.modName ? `, moderator ${s.modName} as Producer` : ""),
    );
  if (s.timer === "Yes") p.push("On-screen speaker timer");
  if (s.teamsConfirm) p.push("Platform: Microsoft Teams");
  return p.join(". ");
}

// What the team should notice before they plan.
export function attentionFlags(s: Submission): string[] {
  const f: string[] = [];
  if (s.dateTbc || s.timeTbc || s.endTbc) f.push("Date or time not confirmed yet");
  if (s.dateUnc && !s.dateTbc) f.push("Date is not confirmed and may change");
  if (s.audienceType === AUDIENCE_OUT)
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

import type {
  Campaign,
  CampaignMilestone,
  KitItem,
  KitSectionStatus,
  KitStage,
  KitValue,
  WebinarKit,
} from "./types";
import { shiftIso, todayIso } from "./dates";

// The 2026 webinar kit, as a workspace inside a campaign. A webinar is a
// campaign of type Webinar; its kit is nine sections, each owned by a role,
// each due a set number of weeks before or after go-live. This file holds
// the definitions (types, formats, roles, sections and their fields) and
// the pure helpers (schedule, state, requirements). No React.
//
// Ported from the Webinar Project Portal. What the portal did with its own
// collections (values, items, notes, files, activity) lives here on the
// campaign document as `webinar`.

// ── Reference data ──────────────────────────────────────────────────────

export const TYPES: Record<
  string,
  { label: string; tag: string; lead: number; dur: string; prod: string; desc: string; best: string[]; prerec?: boolean }
> = {
  tl: {
    label: "Thought Leadership", tag: "Thought leadership", lead: 10, dur: "45–60 minutes", prod: "8–10 weeks",
    desc: "Discussions on major themes such as AI, compliance, disruption and resilience that position CargoWise and WiseTech Global. Panels with senior SMEs, product managers, BDEs, partners and external experts.",
    best: ["panel", "fireside"],
  },
  pdd: {
    label: "Product Deep Dive / Case Study", tag: "Product deep dive", lead: 8, dur: "30–45 minutes", prod: "6–8 weeks",
    desc: "Product explorations or customer case studies across the CargoWise and WiseTech Global ecosystem. Live demos with SMEs and product managers, keynote presentations, single-speaker fireside chats, optional Q&A.",
    best: ["keynote", "fireside"],
  },
  mpu: {
    label: "Market / Product Update", tag: "Market update", lead: 4, dur: "15–20 minutes", prod: "3–4 weeks",
    desc: "Smaller feature releases, insight or intelligence updates, or a current challenge in the market. Always pre-recorded.",
    best: ["keynote"], prerec: true,
  },
};

export const FORMATS: Record<string, { label: string; dur: string; best: string; ros: string[] }> = {
  panel: {
    label: "Panel discussion + Q&A", dur: "45–60 min", best: "Thought Leadership",
    ros: ["Intro", "Panel discussion with prepared prompts and talking points", "Additional discussion (optional)", "Audience Q&A or polls", "Close with CTA"],
  },
  keynote: {
    label: "Keynote presentation with optional demo", dur: "30–45 min with pre-prepared Q&A, 15–20 min without", best: "Product Deep Dives, Market / Product Updates",
    ros: ["Intro", "Presentation with prepared slides and a live or recorded demo", "Optional Q&A: live, or pre-prepared questions if pre-recorded", "Close with CTA"],
  },
  fireside: {
    label: "Fireside chat + Q&A", dur: "30–45 min", best: "every webinar type",
    ros: ["Intro", "Fireside interview with one speaker and a host: the challenge, the implementation, results and metrics", "Second speaker for another fireside discussion (optional)", "Live Q&A or polls", "Close with CTA"],
  },
};

export const DELIVERY: Record<string, string> = { live: "Live", prerecorded: "Pre-recorded" };

export const AUDIENCES = [
  "Current CargoWise customers",
  "Net new prospects",
  "WiseTech / CargoWise investors",
  "CargoWise partners",
];

export const STAGES: { k: KitStage; label: string }[] = [
  { k: "proposed", label: "Proposed" },
  { k: "planning", label: "Planning" },
  { k: "production", label: "Production" },
  { k: "promotion", label: "Promotion" },
  { k: "post", label: "Post-event" },
  { k: "complete", label: "Complete" },
  { k: "hold", label: "On hold" },
  { k: "cancelled", label: "Cancelled" },
];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.k, s.label]));
export const PARKED_STAGES: KitStage[] = ["complete", "hold", "cancelled"];

export const PHASES: Record<string, string> = {
  pilot: "Phase 1 · Pilot & Prove",
  optimize: "Phase 2 · Optimize & Repeat",
  scale: "Phase 3 · Scale & Cadence",
};

export const STATUS: Record<KitSectionStatus, string> = {
  todo: "Not started",
  doing: "In progress",
  review: "In review",
  done: "Done",
  blocked: "Blocked",
  na: "Not needed",
};
export const STATUS_ORDER: KitSectionStatus[] = ["todo", "doing", "review", "done", "blocked", "na"];

export const ROLES: Record<string, { label: string; short: string; hint: string }> = {
  pmm: { label: "Product Marketing", short: "PMM", hint: "Project lead: content, speakers, narrative" },
  producer: { label: "Production support", short: "Production", hint: "Runs the project, platform and recording" },
  digital: { label: "Digital Marketing", short: "Digital", hint: "Platform, registration, email and tracking" },
  video: { label: "Video", short: "Video", hint: "Recording, final edit and snippets" },
  design: { label: "Design", short: "Design", hint: "Creative, assets and slide template" },
  sales: { label: "Sales & Partner Enablement", short: "Sales", hint: "Speakers, lead routing and enablement" },
  partner: { label: "Partner & Industry Marketing", short: "Partner", hint: "Partner and association speakers" },
  comms: { label: "Comms", short: "Comms", hint: "PR, media and corporate alignment" },
  sme: { label: "SMEs & product managers", short: "SME", hint: "Content accuracy and approval" },
};

// Reference documents the kit points at from its fields.
export const LINKS: Record<string, [string, string]> = {
  strategy: ["Webinar strategy 2026", "https://wisetechglobal.sharepoint.com/:w:/r/sites/IntelligenceBank1/Marketing_and_Digital/Planning/2026%20planning/Webinars/CargoWise%20Webinar%20Strategy%202026%20DRAFT%202.docx?d=wed76742a398c40319d1f63a98f3f5a65&csf=1&web=1&e=wYiCAt"],
  kit: ["Webinar Kit 2026 master copy", "https://wisetechglobal.sharepoint.com/:w:/r/sites/IntelligenceBank1/Marketing_and_Digital/Planning/2026%20planning/Webinars/Webinar%20Kit%202026%20Master%20Copy.docx?d=w0e777d2b98eb46a582dc851b2c4e1439&csf=1&web=1&e=qzldWf"],
  style: ["Webinar style guide", "https://wisetechglobal-my.sharepoint.com/:w:/r/personal/madeline_palmer_wisetechglobal_com/Documents/Microsoft%20Copilot%20Chat%20Files/CargoWise%20Webinar%20Style%20Guide.docx?d=wf905fcb6ab5749199dba988c6fe7eca0&csf=1&web=1&e=Dqcfux"],
  landing: ["Landing page template", "https://wisetechglobal.sharepoint.com/:w:/r/sites/IntelligenceBank1/Marketing_and_Digital/Planning/2026%20planning/Webinars/Webinar%20landing%20page%20template%202026.docx?d=wab07dffe2c224858997f2c2e4802fa7e&csf=1&web=1&e=YskK6g"],
  edm: ["EDM and sales script form", "https://wisetechglobal-my.sharepoint.com/:w:/r/personal/lachlan_odea_wisetechglobal_com/Documents/Webinars/Webinar%20EDM%20and%20sales%20script%20template.docx?d=w404e500d211f494da409395280deccca&csf=1&web=1&e=82NaOr"],
  edmEx: ["Landside EDM example", "https://wisetechglobal-my.sharepoint.com/:u:/p/madeline_palmer/IQB89gjGdyG8RqsaJo6TibmOAZXVHhzvfSo1OMK6BynVtsA?e=KkbhD6"],
  followup: ["Follow-up email form", "https://wisetechglobal-my.sharepoint.com/:w:/r/personal/lachlan_odea_wisetechglobal_com/Documents/Webinars/Webinar%20follow%20up-email%20template.docx?d=wdb8744e69d8a4b8382f1a64c4ea7e5c5&csf=1&web=1&e=Wmnlog"],
  social: ["Social posts template", "https://wisetechglobal-my.sharepoint.com/:w:/r/personal/lachlan_odea_wisetechglobal_com/Documents/Webinars/Webinar%20social%20posts%20template%20.docx?d=wbcb19bb2351d44009d1615c0afff7bf5&csf=1&web=1&e=0iCme3"],
  runsheet: ["Example runsheet", "https://wisetechglobal-my.sharepoint.com/:w:/r/personal/lachlan_odea_wisetechglobal_com/Documents/Webinars/Story_board_webinar_reuters.docx?d=waa060597c8cd4c2ca4a26fa77698054b&csf=1&web=1&e=hSScRt"],
  newsletter: ["Newsletter example", "https://cdn.intelligencebank.com/au/share/9yK3/34JB/7ogMl/original/CargoWise+Newsletter+June+22+-+non+customers"],
  audio: ["Audio card example", "https://www.linkedin.com/feed/update/urn:li:activity:6957483420314710016/"],
  partners: ["Find a CargoWise partner", "https://www.cargowise.com/partners/find-a-partner/"],
  experts: ["External experts list", "https://wisetechglobal-my.sharepoint.com/:x:/p/tainara_ferrari/IQAwhinYbaDPRazeZjHDmDefAbMp5xQH-7HRL4aQr4tX_q0?e=726oko"],
};

export const EMAIL_SEQ: { k: string; label: string; when: string; od?: boolean }[] = [
  { k: "e1", label: "Thank you for registering", when: "Immediately after registration" },
  { k: "e2", label: "Reminder: the webinar is tomorrow", when: "1 day before" },
  { k: "e3", label: "Reminder: the webinar starts soon", when: "30 minutes before" },
  { k: "e4", label: "Thanks for attending", when: "1 hour after", od: false },
  { k: "e5", label: "Sorry you couldn’t attend", when: "3 hours after, to no-shows, with the on-demand video", od: true },
  { k: "e6", label: "Watch our webinar on demand", when: "3 hours after, to attendees, with the recording and feedback survey", od: true },
];

export const SOCIAL_CHANNELS = ["CargoWise LinkedIn", "WiseTech Global LinkedIn", "X", "YouTube", "Other"];
export const POST_STATUS = ["Draft", "Approved", "Scheduled", "Posted"];
export const RUNSHEET_ROWS = [
  "Opening title slide", "Section/Slide 1", "Section/Slide 2", "Section/Slide 3",
  "Section/Slide 4", "Section/Slide 5", "Section/Slide 6", "Closing section/slide",
];

// ── Fields ──────────────────────────────────────────────────────────────

export type ItemFieldType = "text" | "area" | "select" | "num" | "date" | "url" | "check" | "asset" | "image";

export type ItemFieldSpec = {
  t: ItemFieldType;
  label: string;
  opts?: string[];
  half?: boolean;
  third?: boolean;
  ph?: string;
  rows?: number;
};

export type KindSpec = {
  noun: string;
  add: string;
  empty: string;
  max?: number;
  defaults?: Record<string, KitValue>;
  title: (d: Record<string, KitValue>, i: number) => string;
  fields: Record<string, ItemFieldSpec>;
};

const str = (v: KitValue | undefined): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export const KINDS: Record<string, KindSpec> = {
  speaker: {
    noun: "a speaker", add: "Add speaker", empty: "No speakers yet.",
    defaults: { status: "Proposed", role: "Presenter" },
    title: (d, i) => str(d.name) || `Speaker ${i + 1}`,
    fields: {
      name: { t: "text", label: "Name", half: true },
      title: { t: "text", label: "Title and organization", half: true },
      role: { t: "select", label: "Role", opts: ["Host", "Moderator", "Presenter", "Panelist", "Interviewee"], half: true },
      status: { t: "select", label: "Status", opts: ["Proposed", "Invited", "Confirmed", "Declined"], half: true },
      bio: { t: "area", label: "Bio (2–3 sentences)" },
      headshot: { t: "image", label: "High-res headshot (link)" },
      packCopy: { t: "area", label: "Speaker pack copy", ph: "The post this speaker shares with their network" },
      packAsset: { t: "asset", label: "Speaker pack image or video (link)" },
    },
  },
  ros: {
    noun: "a run-of-show segment", add: "Add segment", empty: "No segments yet.",
    title: (d, i) => str(d.seg) || `Segment ${i + 1}`,
    fields: {
      seg: { t: "text", label: "Segment", half: true },
      who: { t: "text", label: "Speaker", third: true },
      mins: { t: "num", label: "Minutes", third: true },
    },
  },
  runsheet: {
    noun: "a storyboard row", add: "Add row", empty: "No storyboard rows yet.",
    title: (d, i) => str(d.slide) || `Row ${i + 1}`,
    fields: {
      slide: { t: "text", label: "Slide", half: true },
      who: { t: "text", label: "Speaker", half: true },
      screen: { t: "area", label: "On screen", half: true, rows: 2 },
      script: { t: "area", label: "Speaking notes / script", half: true, rows: 2 },
    },
  },
  social: {
    noun: "a social post", add: "Add social post", empty: "No social posts yet.",
    defaults: { status: "Draft" },
    title: (d, i) => `Social post #${i + 1}${d.channel ? ` · ${str(d.channel)}` : ""}`,
    fields: {
      channel: { t: "select", label: "Channel", opts: SOCIAL_CHANNELS, third: true },
      date: { t: "date", label: "Post date", third: true },
      status: { t: "select", label: "Status", opts: POST_STATUS, third: true },
      copy: { t: "area", label: "Copy", rows: 4 },
      asset: { t: "asset", label: "Image or video (link)" },
    },
  },
  postsocial: {
    noun: "a post-webinar social post", add: "Add social post", empty: "No post-webinar posts yet.",
    defaults: { status: "Draft" },
    title: (d, i) => `Social post #${i + 1}${d.channel ? ` · ${str(d.channel)}` : ""}`,
    fields: {
      channel: { t: "select", label: "Channel", opts: SOCIAL_CHANNELS, third: true },
      date: { t: "date", label: "Post date", third: true },
      status: { t: "select", label: "Status", opts: POST_STATUS, third: true },
      copy: { t: "area", label: "Copy", rows: 4 },
      asset: { t: "asset", label: "Audio card or video snippet (link)" },
    },
  },
  quote: {
    noun: "a quote", add: "Add quote", empty: "No quotes picked yet.", max: 4,
    title: (d, i) => `Quote ${i + 1}${d.who ? ` · ${str(d.who)}` : ""}`,
    fields: {
      who: { t: "text", label: "Speaker", half: true },
      tc: { t: "text", label: "Timecode", ph: "12:40–13:10", half: true },
      quote: { t: "area", label: "Quote (about 30 seconds)", rows: 3 },
    },
  },
  email: {
    noun: "an email", add: "Add email", empty: "No emails drafted yet.",
    defaults: { type: "General EDM" },
    title: (d, i) => `${str(d.type) || `Email ${i + 1}`}${d.date ? ` · ${str(d.date)}` : ""}${d.subject ? ` · ${str(d.subject)}` : ""}`,
    fields: {
      type: { t: "select", label: "Email", opts: ["General EDM", "Sales-led email", "Partner email", "Other"], third: true },
      audience: { t: "text", label: "Audience", ph: "Customers, prospects or partners", third: true },
      date: { t: "date", label: "Send date", third: true },
      subject: { t: "text", label: "Subject line", half: true },
      preheader: { t: "text", label: "Preview text", half: true },
      body: { t: "area", label: "Body copy", rows: 6 },
      cta: { t: "text", label: "CTA button text", ph: "Register now", half: true },
      asset: { t: "asset", label: "Image or banner (link)", half: true },
    },
  },
  xitem: {
    noun: "an item", add: "Add another", empty: "",
    title: (d, i) => str(d.label) || `Item ${i + 1}`,
    fields: {
      label: { t: "text", label: "Item", half: true },
      url: { t: "url", label: "Link", half: true },
      done: { t: "check", label: "Done" },
    },
  },
};

export type FieldType =
  | "text" | "url" | "date" | "num" | "area" | "list" | "select" | "multi" | "check"
  | "heading" | "copyasset" | "approval" | "checklist" | "emailseq" | "metrics" | "emailmetrics"
  | "group" | "series" | "asset";

export type FieldSpec = {
  // Value key. Project-level fields (p) are stored on the kit itself (or
  // the campaign's name); the rest in values[section][k].
  k?: string;
  t: FieldType;
  p?: boolean;
  label?: string;
  hint?: string;
  ph?: string;
  // [value, label] pairs, or plain strings used as both.
  opts?: [string, string][] | string[];
  half?: boolean;
  third?: boolean;
  rows?: number;
  min?: number;
  max?: number;
  // group
  kind?: string;
  cols?: string[];
  list?: string;
  template?: "runsheet" | "social";
  // checklist
  items?: string[];
  links?: boolean | string[];
  extra?: boolean;
  // Only shown when true for the kit.
  show?: (kit: WebinarKit) => boolean;
  // Who fills this in, when it isn't the section's owner.
  role?: string;
  // Due within N days of go-live (post-promotion checks).
  after?: number;
};

export type Ctx = {
  kit: WebinarKit;
  campaign: Campaign;
  V: (sec: string) => Record<string, KitValue>;
  items: (kind: string, list?: string) => KitItem[];
};

export type SectionSpec = {
  k: string;
  n: number;
  title: string;
  short: string;
  owner: string;
  with: string[];
  timing: string;
  start: { a: "prod" | "live"; w?: number; d?: number };
  due: { a: "prod" | "live"; w?: number; d?: number };
  intro: string;
  filesHint?: string;
  fields: FieldSpec[];
  reqs: (c: Ctx) => [string, boolean][];
};

export const has = (x: unknown): boolean =>
  typeof x === "string" ? x.trim().length > 0 : x != null && x !== false && !(Array.isArray(x) && !x.length);
export const lines = (s: unknown): string[] =>
  typeof s === "string" ? s.split("\n").map((x) => x.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean) : [];
export const num = (x: unknown): number | null =>
  typeof x === "number" && isFinite(x)
    ? x
    : typeof x === "string" && x.trim() !== "" && isFinite(+x)
      ? +x
      : null;
export const ratio = (a: number | null, b: number | null): number | null => (a != null && b ? a / b : null);

// "23m 43s", "13:42", "45" (minutes) → seconds.
export function parseDur(s: unknown): number | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.trim().toLowerCase();
  const mm = t.match(/^(\d+):(\d{1,2})$/);
  if (mm) return +mm[1] * 60 + +mm[2];
  let secs = 0;
  let found = false;
  const h = t.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = t.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const sec = t.match(/(\d+(?:\.\d+)?)\s*s/);
  if (h) { secs += +h[1] * 3600; found = true; }
  if (m) { secs += +m[1] * 60; found = true; }
  if (sec) { secs += +sec[1]; found = true; }
  if (found) return Math.round(secs);
  const n = Number(t);
  return isFinite(n) ? Math.round(n * 60) : null;
}
export const fmtPct = (r: number | null): string => (r == null ? "—" : `${Math.round(r * 1000) / 10}%`);
export const fmtNum = (n: number | null): string => (n == null ? "—" : n.toLocaleString());
export const fmtDur = (secs: number | null): string => {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
};

const TYPE_OPTS: [string, string][] = Object.entries(TYPES).map(([k, t]) => [k, t.label]);
const FORMAT_OPTS: [string, string][] = Object.entries(FORMATS).map(([k, f]) => [k, f.label]);
const DELIVERY_OPTS: [string, string][] = Object.entries(DELIVERY);
const STAGE_OPTS: [string, string][] = STAGES.map((s) => [s.k, s.label]);
const PHASE_OPTS: [string, string][] = Object.entries(PHASES);
const prerec = (kit: WebinarKit) => kit.delivery === "prerecorded";
const activeSpeakers = (c: Ctx) => c.items("speaker").filter((s) => s.d.status !== "Declined");

export const SECTIONS: SectionSpec[] = [
  {
    k: "brief", n: 1, title: "Webinar brief", short: "Brief", owner: "pmm", with: ["comms", "partner"],
    timing: "8–10 weeks before go-live", start: { a: "prod", w: -10 }, due: { a: "prod", w: -8 },
    intro: "The proposal. Agree the audience, format, speakers and success criteria before production starts.",
    filesHint: "Key resources: ebooks, decks, videos and briefs.",
    fields: [
      { k: "wt", p: true, t: "text", label: "Working title", ph: "A working title for the proposal" },
      { k: "type", p: true, t: "select", label: "Webinar series type", opts: TYPE_OPTS, half: true },
      { k: "delivery", p: true, t: "select", label: "Live or pre-recorded", opts: DELIVERY_OPTS, half: true },
      { k: "series", p: true, t: "series", label: "Series", half: true, hint: "Episodes of a series share this name. Leave blank for a standalone webinar." },
      { k: "ep", p: true, t: "num", label: "Episode", half: true },
      { k: "audience", t: "multi", label: "Target audience", opts: AUDIENCES },
      { k: "audienceNotes", t: "area", label: "Audience detail", ph: "Primary and secondary audiences, roles and seniority, and what each should take away", rows: 4 },
      { k: "sessions", p: true, t: "area", label: "Region / timezone", ph: "Session 1: APAC – 2:00pm AEST\nSession 2: Europe + the Americas – 10:00am CT", rows: 2 },
      { k: "format", p: true, t: "select", label: "Proposed format", opts: FORMAT_OPTS, half: true },
      { k: "duration", p: true, t: "text", label: "Duration", ph: "30–45 minutes", half: true },
      { k: "goLive", p: true, t: "date", label: "Go-live date", half: true, hint: "Every due date in the kit is counted back from this." },
      { k: "recordDate", p: true, t: "date", label: "Recording date", half: true, show: prerec, hint: "Production sections are due against the recording." },
      { k: "dateNotes", t: "text", label: "Date notes", ph: "Preferred dates, sessions still TBC, dependencies" },
      { k: "speakers", t: "group", kind: "speaker", cols: ["name", "title", "status"], label: "Proposed / preferred speakers", hint: "Partner, association and external expert speakers are welcome.", links: ["partners", "experts"] },
      { k: "speakerNotes", t: "area", label: "Speaker notes", ph: "Availability, hosts, changes and who still needs confirming", rows: 2 },
      { t: "heading", label: "Success criteria", hint: "Set targets before production begins so results can be compared across webinars." },
      { k: "tReg", t: "num", label: "Target registrations", third: true },
      { k: "tAtt", t: "num", label: "Target attendance rate (%)", third: true },
      { k: "tWatch", t: "num", label: "Target live watch time (min)", third: true },
      { k: "tCta", t: "text", label: "CTA and outcome goal", ph: "e.g. 40 demo requests, 25 qualified leads for BDEs" },
      { t: "heading", label: "Alignment" },
      { k: "commsCheck", t: "check", label: "Topic shared with Comms for PR, media and corporate alignment" },
      { k: "partnerCheck", t: "check", label: "Partner or association involvement flagged with Partner & Industry Marketing" },
    ],
    reqs: (c) => {
      const p = c.kit, v = c.V("brief");
      return [
        ["Working title", has(p.wt)], ["Series type", has(p.type)], ["Live or pre-recorded", has(p.delivery)],
        ["Target audience", Array.isArray(v.audience) && v.audience.length > 0], ["Region and timezone", has(p.sessions)],
        ["Format", has(p.format)], ["Go-live date", has(p.goLive)], ["Proposed speakers", c.items("speaker").length > 0],
        ["Target registrations", (num(v.tReg) ?? 0) > 0],
      ];
    },
  },
  {
    k: "core", n: 2, title: "Core message & value", short: "Core message", owner: "pmm", with: ["sme"],
    timing: "7–8 weeks before go-live", start: { a: "prod", w: -8 }, due: { a: "prod", w: -7 },
    intro: "Completed by Product Marketing with SME or product manager oversight and approval.",
    fields: [
      { k: "problem", t: "area", label: "Core problem for the target audience", rows: 5 },
      { k: "why", t: "area", label: "Why it matters", rows: 3 },
      { k: "takeaways", t: "list", label: "Audience takeaways", hint: "Three to five, one per line.", min: 3, max: 5, rows: 5 },
      { k: "approval", t: "approval", label: "SME / product manager approval" },
    ],
    reqs: (c) => {
      const v = c.V("core"), n = lines(v.takeaways).length;
      return [["Core problem", has(v.problem)], ["Why it matters", has(v.why)], ["3–5 audience takeaways", n >= 3 && n <= 5], ["SME / PM approval", !!v["approval|ok"]]];
    },
  },
  {
    k: "landing", n: 3, title: "Landing page & promotion inputs", short: "Landing page", owner: "pmm", with: ["digital", "sales"],
    timing: "5–6 weeks before go-live", start: { a: "live", w: -6 }, due: { a: "live", w: -5 },
    intro: "Everything Digital needs to build the registration page and email sequence. Submit to Digital.",
    fields: [
      { k: "goLive", p: true, t: "date", label: "Go-live date", half: true },
      { k: "duration", p: true, t: "text", label: "Duration", half: true },
      { k: "sessions", p: true, t: "area", label: "Date and time (include time zone)", rows: 2 },
      { k: "ft", p: true, t: "text", label: "Final webinar title", links: ["style"] },
      { k: "hero", t: "asset", label: "Hero image or video", hint: "Paste a link to the asset." },
      { k: "summary", t: "area", label: "Summary", rows: 6, links: ["landing"] },
      { k: "learn", t: "list", label: "‘What you’ll learn’ bullet points", hint: "One per line.", min: 3, max: 5, rows: 4 },
      { k: "speakers", t: "group", kind: "speaker", cols: ["name", "title", "bio", "headshot"], label: "Speaker details", hint: "Name, title, high-res headshot and a 2–3 sentence bio." },
      { k: "emails", t: "group", kind: "email", label: "General EDM and sales-led emails", hint: "Draft each email here with its send date. Digital and Sales Enablement work from this list.", links: ["edmEx"] },
      { k: "edmLink", t: "url", label: "Or link to a completed EDM form", hint: "Only if the copy already lives in a Word form." },
      { k: "emailSeq", t: "emailseq", label: "Email sequence" },
      { k: "emailSeqLink", t: "url", label: "Or link to a completed email sequence form", hint: "Only if the copy already lives in a Word form." },
      { k: "landingLink", t: "url", label: "Landing page link", role: "digital", hint: "Added by Digital once the registration page is live." },
    ],
    reqs: (c) => {
      const p = c.kit, v = c.V("landing"), sp = activeSpeakers(c);
      return [
        ["Date, time and time zone", has(p.goLive) && has(p.sessions)], ["Final webinar title", has(p.ft)], ["Summary", has(v.summary)],
        ["‘What you’ll learn’ bullets", lines(v.learn).length >= 3], ["Speaker bios", sp.length > 0 && sp.every((s) => has(s.d.bio))],
        ["Speaker headshots", sp.length > 0 && sp.every((s) => has(s.d.headshot))],
        ["EDM and sales email scripts", has(v.edmLink) || c.items("email").some((e) => has(e.d.body))], ["Landing page link", has(v.landingLink)],
      ];
    },
  },
  {
    k: "confirm", n: 4, title: "Speakers, run of show & assets", short: "Speakers & assets", owner: "pmm", with: ["sme", "digital", "video", "design"],
    timing: "4–6 weeks before go-live", start: { a: "prod", w: -6 }, due: { a: "prod", w: -4 },
    intro: "Confirmed speakers and format, the run of show, and requests to Video and Design.",
    fields: [
      { k: "speakers", t: "group", kind: "speaker", cols: ["name", "title", "role", "status"], label: "Confirmed speakers and moderator" },
      { k: "format", p: true, t: "select", label: "Confirmed format", opts: FORMAT_OPTS },
      { k: "ros", t: "group", kind: "ros", label: "High-level run of show", hint: "Segments, who leads each one and how long it runs." },
      { k: "demoReq", t: "area", label: "Demo / video requirements", ph: "What does it need to demonstrate to the audience?", rows: 3 },
      { k: "demoLink", t: "url", label: "Demo video link" },
      { k: "slideReq", t: "area", label: "Slide deck design requirements", rows: 3 },
      { k: "draftSlides", t: "url", label: "Draft slides link", hint: "Provide to Design.", half: true },
      { k: "finalSlides", t: "url", label: "Final slides link", role: "design", hint: "Provided by Design.", half: true },
    ],
    reqs: (c) => {
      const p = c.kit, v = c.V("confirm"), sp = activeSpeakers(c);
      return [["All speakers confirmed", sp.length > 0 && sp.every((s) => s.d.status === "Confirmed")], ["Format confirmed", has(p.format)], ["Run of show", c.items("ros").length > 0], ["Final slides link", has(v.finalSlides)]];
    },
  },
  {
    k: "runsheet", n: 5, title: "Runsheet & storyboard", short: "Runsheet", owner: "pmm", with: ["sme", "video"],
    timing: "3–4 weeks before go-live", start: { a: "prod", w: -4 }, due: { a: "prod", w: -3 },
    intro: "Built with speakers and SMEs, then provided to the video team ahead of recording or go-live. Due before the first dry run.",
    fields: [
      { k: "board", t: "group", kind: "runsheet", label: "Storyboard", hint: "Slide, what is on screen, and the speaking notes or script.", template: "runsheet" },
      { k: "runsheetLink", t: "url", label: "Storyboard document (optional)", hint: "Only if a version also lives in Word or PowerPoint.", links: ["runsheet"] },
      { k: "toVideo", t: "check", label: "Provided to the video team" },
    ],
    reqs: (c) => {
      const v = c.V("runsheet");
      return [["Runsheet or storyboard", has(v.runsheetLink) || c.items("runsheet").length > 0], ["Provided to the video team", !!v.toVideo]];
    },
  },
  {
    k: "prepromo", n: 6, title: "Pre-promotion", short: "Pre-promo", owner: "pmm", with: ["digital", "sales", "partner", "design"],
    timing: "3–4 weeks before go-live", start: { a: "live", w: -4 }, due: { a: "live", w: -3 },
    intro: "Social posts, speaker packs and newsletters, submitted to Digital and Sales & Partner Enablement.",
    fields: [
      { k: "social", t: "group", kind: "social", label: "Social posts", template: "social" },
      { k: "packs", t: "group", kind: "speaker", cols: ["name", "packCopy", "packAsset"], label: "Speaker packs", hint: "Copy and a visual asset for each speaker to post to their network. Shared with PMs by email, with Sales via DSMN8, and with partners and external experts through the agreed channel." },
      { k: "packsSent", t: "check", label: "Speaker packs distributed" },
      { t: "heading", label: "Newsletter promotion", links: ["newsletter"] },
      { k: "nlCust", t: "copyasset", label: "Customer newsletter copy" },
      { k: "nlNon", t: "copyasset", label: "Non-customer (opt-in) newsletter copy" },
      { k: "nlPart", t: "copyasset", label: "Partner newsletter copy" },
    ],
    reqs: (c) => {
      const v = c.V("prepromo"), sp = activeSpeakers(c);
      return [
        ["Three social posts", c.items("social").filter((x) => has(x.d.copy)).length >= 3],
        ["Speaker pack copy for every speaker", sp.length > 0 && sp.every((s) => has(s.d.packCopy))],
        ["Customer newsletter copy", has(v["nlCust|copy"])], ["Non-customer newsletter copy", has(v["nlNon|copy"])], ["Partner newsletter copy", has(v["nlPart|copy"])],
      ];
    },
  },
  {
    k: "final", n: 7, title: "Final checks", short: "Final checks", owner: "pmm", with: ["video", "digital"],
    timing: "2–1 weeks before go-live", start: { a: "prod", w: -2 }, due: { a: "live", d: 0 },
    intro: "Coordinated with the video producer, Digital and the speakers.",
    fields: [
      { k: "signoff", t: "date", label: "Final asset approval and runsheet sign-off", half: true },
      { k: "dry1", t: "date", label: "Dry run #1", half: true, hint: "Technical call with every participant and the video producer: walk through the runsheet and technical requirements, share best-practice reminders, and troubleshoot." },
      { k: "dry2", t: "date", label: "Dry run #2 (if needed)", half: true, hint: "A practice run to iron out issues before recording or go-live." },
      { k: "recordDate", p: true, t: "date", label: "Recording date", half: true, show: prerec },
      { k: "goLive", p: true, t: "date", label: "Go-live date", half: true },
      { k: "sessions", p: true, t: "area", label: "Session times", rows: 2 },
      { k: "dayof", t: "checklist", label: "On the day", items: ["All participants online 30 minutes before kickoff", "Video producer monitoring the technical side", "Product Marketing monitoring live audience engagement (live sessions)"] },
      { k: "finalEdit", t: "url", label: "Post-production video: final edit link", hint: "Once recorded, the video team makes the final edit.", show: prerec },
      { k: "up23", t: "check", label: "Final edit uploaded to TwentyThree", role: "digital", show: prerec },
    ],
    reqs: (c) => {
      const p = c.kit, v = c.V("final"), pre = prerec(p);
      const r: [string, boolean][] = [["Sign-off date", has(v.signoff)], ["Dry run #1 booked", has(v.dry1)], [pre ? "Recording date" : "Go-live date", has(pre ? p.recordDate : p.goLive)]];
      if (pre) r.push(["Final edit link", has(v.finalEdit)], ["Uploaded to TwentyThree", !!v.up23]);
      return r;
    },
  },
  {
    k: "post", n: 8, title: "Post-promotion", short: "Post-promo", owner: "pmm", with: ["digital", "video", "sales"],
    timing: "1 week after go-live", start: { a: "live", d: 0 }, due: { a: "live", d: 7 },
    intro: "Drive people to the on-demand recording and hand leads to Sales.",
    fields: [
      { k: "odLink", t: "url", label: "On-demand link on the CargoWise website", hint: "Product Marketing coordinates with Digital." },
      { k: "quotes", t: "group", kind: "quote", label: "Audio cards and video snippets", hint: "Request the transcript from the video team, then pick up to four of the strongest quotes (about 30 seconds each) with timecodes.", links: ["audio"] },
      { k: "postSocial", t: "group", kind: "postsocial", label: "Post-webinar social posts" },
      { t: "heading", label: "On-demand newsletter promotion" },
      { k: "odCust", t: "copyasset", label: "Customer newsletter copy" },
      { k: "odNon", t: "copyasset", label: "Non-customer (opt-in) newsletter copy" },
      { k: "odPart", t: "copyasset", label: "Partner newsletter copy" },
      { t: "heading", label: "Sales Enablement Framework and DSMN8" },
      { k: "sef1", t: "check", label: "Attendee and registration lists cross-referenced against DELTA targets and existing customers" },
      { k: "sef2", t: "check", label: "Shared with Global Sales in the Sales Enablement Framework", after: 3 },
      { k: "sef3", t: "check", label: "Leads and opportunities updated in ediProd", after: 5 },
      { k: "spinoffs", t: "checklist", label: "Content spinoffs", items: ["Blog / article", "Written case study", "Follow-up webinar or series", "“CargoWise Catch Ups” with WiseTech Academy"], links: true, extra: true },
    ],
    reqs: (c) => {
      const v = c.V("post");
      return [
        ["On-demand link on the website", has(v.odLink)], ["Audio cards or snippets", c.items("quote").length > 0], ["Post-webinar social posts", c.items("postsocial").length > 0],
        ["On-demand newsletter copy", has(v["odCust|copy"]) || has(v["odNon|copy"]) || has(v["odPart|copy"])],
        ["Shared with Global Sales", !!v.sef2], ["Leads updated in ediProd", !!v.sef3],
      ];
    },
  },
  {
    k: "results", n: 9, title: "Results & learnings", short: "Results", owner: "digital", with: ["pmm"],
    timing: "2 weeks after go-live", start: { a: "live", d: 1 }, due: { a: "live", d: 14 },
    intro: "Performance from Digital, then the learnings summary that shapes the next iteration.",
    fields: [
      { t: "heading", label: "Performance", hint: "From TwentyThree and HubSpot." },
      { k: "pageViews", t: "num", label: "Landing page views", third: true },
      { k: "regs", t: "num", label: "Registrants", third: true },
      { k: "atts", t: "num", label: "Live attendees", third: true },
      { k: "odViews", t: "num", label: "On-demand views", third: true },
      { k: "liveEng", t: "text", label: "Live average engagement", ph: "23m 43s", third: true },
      { k: "odEng", t: "text", label: "On-demand average engagement", ph: "13m 42s", third: true },
      { t: "metrics" },
      { k: "qna", t: "num", label: "Q&A questions asked", third: true },
      { k: "polls", t: "num", label: "Poll responses", third: true },
      { k: "leads", t: "num", label: "Leads identified", third: true },
      { k: "dropoff", t: "area", label: "Drop-off points (live and on-demand)", rows: 2 },
      { k: "cta", t: "area", label: "CTA performance", rows: 2 },
      { k: "leadConv", t: "text", label: "Lead conversion rate", ph: "e.g. 8% of attendees became opportunities", half: true },
      { k: "survey", t: "url", label: "Feedback survey", half: true },
      { t: "heading", label: "Email performance" },
      { k: "emSent", t: "num", label: "Emails sent", third: true },
      { k: "emOpen", t: "num", label: "Opened", third: true },
      { k: "emClick", t: "num", label: "Unique register clicks", third: true },
      { t: "emailmetrics" },
      { k: "emNotes", t: "area", label: "Email notes", rows: 3 },
      { k: "feedback", t: "area", label: "Qualitative feedback from internal teams and speakers", rows: 3 },
      { t: "heading", label: "Learnings", hint: "The pilot summary: what to keep, fix or drop next time." },
      { k: "worked", t: "area", label: "What worked well", rows: 3 },
      { k: "under", t: "area", label: "What underperformed", rows: 3 },
      { k: "effort", t: "select", label: "Production effort", opts: ["Low", "Medium", "High"], half: true },
      { k: "impact", t: "select", label: "Perceived impact", opts: ["Low", "Medium", "High"], half: true },
      { k: "effortNotes", t: "area", label: "Effort vs impact notes", rows: 2 },
      { k: "recs", t: "area", label: "Recommendations for the next iteration", rows: 3 },
      { k: "decision", t: "select", label: "Format decision", opts: ["Ready for regular cadence", "Needs further refinement", "Keep ad hoc", "Deprioritize"] },
    ],
    reqs: (c) => {
      const v = c.V("results");
      return [
        ["Registrants and attendees", (num(v.regs) ?? 0) > 0 && (num(v.atts) ?? 0) > 0], ["Engagement", has(v.liveEng) || has(v.odEng)],
        ["What worked well", has(v.worked)], ["What underperformed", has(v.under)], ["Recommendations", has(v.recs)], ["Format decision", has(v.decision)],
      ];
    },
  },
];
export const SEC_BY_KEY: Record<string, SectionSpec> = Object.fromEntries(SECTIONS.map((s) => [s.k, s]));

// The project-level details card on the Overview.
export const OV_FIELDS: FieldSpec[] = [
  { k: "stage", p: true, t: "select", label: "Stage", opts: STAGE_OPTS, half: true },
  { k: "phase", p: true, t: "select", label: "Strategy phase", opts: PHASE_OPTS, half: true, ph: "No phase" },
  { k: "series", p: true, t: "series", label: "Series", half: true, hint: "Episodes of a series share this name." },
  { k: "ep", p: true, t: "num", label: "Episode", half: true },
  { k: "type", p: true, t: "select", label: "Webinar series type", opts: TYPE_OPTS, half: true },
  { k: "delivery", p: true, t: "select", label: "Live or pre-recorded", opts: DELIVERY_OPTS, half: true },
  { k: "format", p: true, t: "select", label: "Format", opts: FORMAT_OPTS, half: true },
  { k: "duration", p: true, t: "text", label: "Duration", half: true },
  { k: "goLive", p: true, t: "date", label: "Go-live date", half: true },
  { k: "recordDate", p: true, t: "date", label: "Recording date", half: true, show: prerec },
  { k: "wt", p: true, t: "text", label: "Working title" },
  { k: "ft", p: true, t: "text", label: "Final webinar title" },
  { k: "sessions", p: true, t: "area", label: "Sessions and time zones", rows: 2 },
  { k: "folder", p: true, t: "url", label: "Project folder (SharePoint)" },
];

// Project-level keys that live on the kit object itself.
export const KIT_ROOT_KEYS = new Set([
  "stage", "type", "delivery", "format", "phase", "series", "ep", "goLive", "recordDate",
  "wt", "ft", "sessions", "duration", "folder",
]);

// ── Identity ────────────────────────────────────────────────────────────

export const WEBINAR_CATEGORY = "Webinar";

export function isWebinarCampaign(c: Campaign): boolean {
  return !!c.webinar || c.category === WEBINAR_CATEGORY;
}

export function newKitId(prefix = "k"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// A fresh kit for a campaign. The go-live date comes from a Webinar
// milestone if the campaign has one, else the campaign's end date.
export function emptyKit(c: Partial<Campaign>, defaults: Partial<WebinarKit> = {}): WebinarKit {
  const ms = (c.milestones ?? []).find((m) => m.label === "Webinar");
  const now = new Date().toISOString();
  return {
    stage: "planning",
    type: "pdd",
    delivery: "live",
    format: "",
    phase: "",
    series: "",
    goLive: ms?.date ?? c.endDate ?? "",
    recordDate: "",
    wt: "",
    ft: "",
    sessions: "",
    duration: TYPES.pdd.dur,
    folder: "",
    lead: c.ownerId,
    team: c.ownerId ? { pmm: [c.ownerId] } : {},
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

// The kit as the page works with it: stored, or a default for a Webinar
// campaign saved before the kit existed.
export function kitOf(c: Campaign): WebinarKit | null {
  if (c.webinar) return c.webinar;
  if (c.category === WEBINAR_CATEGORY) return emptyKit(c);
  return null;
}

export function kitName(c: Campaign): string {
  return c.name || c.webinar?.wt || "Untitled webinar";
}

export function typeTag(kit: WebinarKit): string {
  return [TYPES[kit.type]?.tag ?? "Webinar", DELIVERY[kit.delivery]].filter(Boolean).join(" · ");
}

export function seriesLabel(kit: WebinarKit, long = false, episodes = 0): string {
  if (!kit.series) return "";
  const ep = kit.ep;
  if (!long) return kit.series + (ep ? ` · Ep ${ep}` : "");
  return kit.series + (ep ? ` · Episode ${ep}${episodes > 1 ? ` of ${episodes}` : ""}` : "");
}

// ── Schedule ────────────────────────────────────────────────────────────

function dow(iso: string): number {
  return new Date(`${iso}T00:00:00`).getDay();
}
// A due date on a weekend moves back to the Friday; a start moves on to
// the Monday.
function snapBack(iso: string): string {
  const d = dow(iso);
  return d === 6 ? shiftIso(iso, -1) : d === 0 ? shiftIso(iso, -2) : iso;
}
function snapFwd(iso: string): string {
  const d = dow(iso);
  return d === 6 ? shiftIso(iso, 2) : d === 0 ? shiftIso(iso, 1) : iso;
}

function anchors(kit: WebinarKit): { live: string; prod: string } {
  const live = kit.goLive || "";
  const rec = kit.delivery === "prerecorded" ? kit.recordDate || "" : "";
  return { live, prod: rec || live };
}

function offsetDays(x: { w?: number; d?: number }, scale: number): number {
  return x.w !== undefined ? Math.round(x.w * 7 * (x.w < 0 ? scale : 1)) : (x.d ?? 0);
}

export type SectionSchedule = { start: string; due: string; kitDue: string; custom: boolean };

// Start and due for every section: counted back from go-live (or the
// recording for production sections), scaled by the type's lead time,
// unless someone set a due date by hand.
export function schedule(kit: WebinarKit): Record<string, SectionSchedule> {
  const out: Record<string, SectionSchedule> = {};
  const a = anchors(kit);
  const scale = (TYPES[kit.type]?.lead ?? 10) / 10;
  for (const s of SECTIONS) {
    const sa = a[s.start.a], da = a[s.due.a];
    let start = sa ? snapFwd(shiftIso(sa, offsetDays(s.start, scale))) : "";
    const kitDue = da ? snapBack(shiftIso(da, offsetDays(s.due, scale))) : "";
    const ov = kit.sec[s.k]?.due || "";
    const due = ov || kitDue;
    if (start && due && start > due) start = due;
    out[s.k] = { start, due, kitDue, custom: !!ov };
  }
  return out;
}

export const secStatus = (kit: WebinarKit, k: string): KitSectionStatus => kit.sec[k]?.status ?? "todo";

export type SectionInfo = {
  s: SectionSpec;
  st: KitSectionStatus;
  due: string;
  start: string;
  days: number | null;
  open: boolean;
  late: boolean;
  soon: boolean;
};

export type KitState = {
  sch: Record<string, SectionSchedule>;
  infos: SectionInfo[];
  done: number;
  total: number;
  late: SectionInfo[];
  next: SectionInfo | null;
  health: { k: "ok" | "warn" | "bad"; label: string } | null;
  parked: boolean;
};

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

export function kitState(kit: WebinarKit, today = todayIso()): KitState {
  const sch = schedule(kit);
  const infos: SectionInfo[] = SECTIONS.map((s) => {
    const st = secStatus(kit, s.k);
    const due = sch[s.k].due;
    const open = st !== "done" && st !== "na";
    const days = due ? daysBetween(today, due) : null;
    return {
      s, st, due, start: sch[s.k].start, days, open,
      late: open && days !== null && days < 0,
      soon: open && days !== null && days >= 0 && days <= 7,
    };
  });
  const applicable = infos.filter((i) => i.st !== "na");
  const done = applicable.filter((i) => i.st === "done").length;
  const late = infos.filter((i) => i.late);
  const risk = infos.filter((i) => (i.open && i.st === "blocked") || (i.soon && i.st === "todo"));
  const next = infos.filter((i) => i.open).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))[0] ?? null;
  const parked = PARKED_STAGES.includes(kit.stage) || !!kit.archived;
  const health = parked
    ? null
    : late.length
      ? { k: "bad" as const, label: `${late.length} overdue` }
      : risk.length
        ? { k: "warn" as const, label: "At risk" }
        : { k: "ok" as const, label: "On track" };
  return { sch, infos, done, total: applicable.length, late, next, health, parked };
}

// Who's responsible for a section: the person assigned to it, else the
// owning role's team, else the lead for Product Marketing sections.
export function sectionPeople(kit: WebinarKit, s: SectionSpec): string[] {
  const who = kit.sec[s.k]?.who;
  if (who) return [who];
  const team = kit.team[s.owner] ?? [];
  if (team.length) return team;
  if (s.owner === "pmm" && kit.lead) return [kit.lead];
  return [];
}

export function isMineKit(kit: WebinarKit, me: string): boolean {
  if (kit.lead === me) return true;
  return Object.values(kit.team).some((list) => list.includes(me));
}

export function isMineSection(kit: WebinarKit, s: SectionSpec, me: string): boolean {
  if (sectionPeople(kit, s).includes(me)) return true;
  return s.with.some((role) => (kit.team[role] ?? []).includes(me));
}

export function ctxFor(campaign: Campaign, kit: WebinarKit): Ctx {
  return {
    kit,
    campaign,
    V: (sec) => kit.values[sec] ?? {},
    items: (kind, list) =>
      kit.items
        .filter((i) => i.kind === kind && (list ? i.list === list : !i.list))
        .sort((a, b) => a.order - b.order || a.at.localeCompare(b.at)),
  };
}

// The value a field shows: project-level fields from the kit root (the
// campaign's name for "name"), the rest from the section's values.
export function fieldValue(c: Ctx, f: FieldSpec, sec: string, key = f.k ?? ""): KitValue | undefined {
  if (f.p) {
    if (key === "name") return c.campaign.name;
    return (c.kit as unknown as Record<string, KitValue | undefined>)[key];
  }
  return c.V(sec)[key];
}

// ── Mutations (pure: return the next kit) ───────────────────────────────

export function setKitValue(kit: WebinarKit, sec: string, key: string, value: KitValue | undefined): WebinarKit {
  const cur = kit.values[sec] ?? {};
  const next = { ...cur };
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
  else next[key] = value;
  return { ...kit, values: { ...kit.values, [sec]: next } };
}

export function setKitRoot(kit: WebinarKit, key: string, value: KitValue | undefined): WebinarKit {
  const k = kit as unknown as Record<string, unknown>;
  const next = { ...k } as Record<string, unknown>;
  if (key === "ep") next.ep = num(value) ?? undefined;
  else next[key] = value ?? "";
  return next as unknown as WebinarKit;
}

export function addActivity(kit: WebinarKit, section: string, what: string, detail = "", by?: string): WebinarKit {
  const entry = { id: newKitId("a"), section, what, detail: detail || undefined, by, at: new Date().toISOString() };
  return { ...kit, activity: [entry, ...kit.activity].slice(0, 300), updatedAt: entry.at };
}

// Keep the campaign's "Webinar" milestone on the go-live date, so the
// webinar shows on the Campaigns calendar and the Social calendar's
// overlay like any other dated moment.
export function syncWebinarMilestone(c: Campaign, kit: WebinarKit): CampaignMilestone[] {
  const ms = c.milestones.slice();
  const i = ms.findIndex((m) => m.label === "Webinar");
  if (!kit.goLive) return ms;
  if (i >= 0) {
    if (ms[i].date !== kit.goLive) ms[i] = { ...ms[i], date: kit.goLive };
  } else {
    ms.push({ id: newKitId("ms"), date: kit.goLive, label: "Webinar", done: kit.stage === "post" || kit.stage === "complete" });
  }
  return ms.sort((a, b) => a.date.localeCompare(b.date));
}

// The campaign with a new kit on it: the kit, the synced milestone, and
// the campaign's run stretched to cover the kit's schedule.
export function withKit(c: Campaign, kit: WebinarKit): Campaign {
  const next: Campaign = { ...c, webinar: { ...kit, updatedAt: new Date().toISOString() } };
  next.milestones = syncWebinarMilestone(c, kit);
  if (kit.goLive) {
    const sch = schedule(kit);
    const starts = Object.values(sch).map((s) => s.start).filter(Boolean).sort();
    const dues = Object.values(sch).map((s) => s.due).filter(Boolean).sort();
    if (starts.length && !c.evergreen) next.startDate = starts[0] < kit.goLive ? starts[0] : c.startDate || kit.goLive;
    if (dues.length && !c.evergreen) next.endDate = dues[dues.length - 1] > kit.goLive ? dues[dues.length - 1] : kit.goLive;
  }
  return next;
}

// ── Results table ───────────────────────────────────────────────────────

export type ResultRow = {
  c: Campaign;
  kit: WebinarKit;
  v: Record<string, KitValue>;
  regs: number | null;
  atts: number | null;
  views: number | null;
  att: number | null;
  conv: number | null;
  live: number | null;
  od: number | null;
  tReg: number | null;
  tAtt: number | null;
  decision: string;
};

export function resultRows(campaigns: Campaign[]): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const c of campaigns) {
    const kit = kitOf(c);
    if (!kit) continue;
    const v = kit.values.results ?? {};
    const t = kit.values.brief ?? {};
    const regs = num(v.regs), atts = num(v.atts), views = num(v.pageViews);
    if (regs == null && atts == null && views == null) continue;
    rows.push({
      c, kit, v, regs, atts, views,
      att: ratio(atts, regs), conv: ratio(regs, views),
      live: parseDur(v.liveEng), od: parseDur(v.odEng),
      tReg: num(t.tReg), tAtt: num(t.tAtt), decision: str(v.decision),
    });
  }
  return rows.sort((a, b) => (b.kit.goLive || "").localeCompare(a.kit.goLive || ""));
}

export function allSeries(campaigns: Campaign[]): string[] {
  return [...new Set(campaigns.map((c) => c.webinar?.series?.trim() ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

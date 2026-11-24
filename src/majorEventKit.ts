import type { KitValue } from "./types";
import { MAJOR_SECTIONS, majorDef, type MajorSectionOutline } from "./majorEvent";
import { has, type Ctx, type FieldSpec, type KindSpec, type KitDef, type SectionSpec } from "./webinarKit";

// What is inside the Major Event Workflow's twelve sections: each one's
// tasks, in the workflow's own words, the fields that record what they
// settle, and the repeatable rows (suppliers, the attendance register,
// sessions, crew, the campaign calendar, signage, the support roster and
// the run of show). The outline it hangs on (roles, sections, due dates)
// and the helpers that tie the kit to its event are in majorEvent.ts.
//
// Kept apart from that file because it is mostly words, and only the major
// event's own page needs them: the page is loaded on demand, and this with
// it. No React.

// ── Repeatable rows ─────────────────────────────────────────────────────

const str = (v: KitValue | undefined): string => (typeof v === "string" ? v : v == null ? "" : String(v));

// Section 7's plan: what goes out on each channel, and when.
const PROMO_CHANNELS = ["EDMs", "Organic social", "DSMN8"];
const PROMO_PLAN: string[][] = [
  ["6–8 weeks out", "Save-the-date or launch invitation.", "Event announcement and reason to attend.", "Announcement with shareable copy."],
  ["3–5 weeks out", "Agenda or speaker spotlight and targeted outreach.", "Speaker reveal, agenda highlight or preview clip.", "Speaker or programme spotlight."],
  ["1–2 weeks out", "RSVP reminder. Send logistics or join instructions to registrants.", "Final registration or stream reminder, subject to availability.", "Final invitation or livestream CTA."],
  ["Event day", "Joining reminder and any material updates.", "Approved photos, quotes or highlights.", "Approved event-day post."],
  ["1–2 days after", "Thank-you and survey. Follow up separately with no-shows where relevant.", "Recap with an approved photo, quote or takeaway.", "Recap options employees can personalise."],
  ["After recording approval", "On-demand link and resources for eligible audiences.", "Highlight clip or on-demand CTA.", "Recording or highlights post."],
];

// Section 10's roster: who supports each area on the day.
const ROSTER: [string, string, string][] = [
  ["Entry and registration", "Registration lead, scanners, exceptions desk, queue marshals", "Check-ins, badges, queues, counts and walk-ins."],
  ["Guest movement and seating", "Floor lead, ushers, accessibility contact", "Wayfinding, reserved seats, late arrivals and room changes."],
  ["Executives and speakers", "Executive liaison, speaker liaison, stage manager", "Arrivals, holding room, speaker readiness and stage handover."],
  ["Stage and broadcast", "Show caller, AV crew, stream operator, moderator", "Cues, slides, audio, stream, recording and remote questions."],
  ["Catering", "Venue lead and catering supervisor", "Service readiness, special meals, queues and replenishment."],
  ["Content and communications", "Capture crew, social lead and approvals contact", "Approved live coverage, event capture and attendee updates."],
  ["Event control and close", "Event Lead, deputy, venue duty contact and asset owner", "Issues, timing, escalation, supplier decisions, returns and venue handback."],
];

// Section 11's example timings, to adjust to the venue and the agenda.
const RUN_OF_SHOW: [string, string, string, string][] = [
  ["07:00", "Venue and supplier access", "Venue Lead", "Confirm handover, room layout and load-in."],
  ["08:00", "Production and registration checks", "Production and Registration Leads", "Test cues, stream, local recording and check-in backups."],
  ["08:25", "Doors decision", "Event Lead", "Obtain clearance or hold doors and issue an update."],
  ["08:30", "Registration opens", "Registration Lead", "Monitor queues, badge exceptions and arrival counts."],
  ["09:15", "Welcome and executive keynote", "Show Caller", "Cue MC, speaker, microphones, slides and stream."],
  ["10:05 / 12:00", "Break and lunch service", "Venue Lead", "Confirm station readiness and special meal handover."],
  ["15:30", "Closing remarks and departure", "Show Caller and Floor Lead", "Cue survey and departure information."],
  ["16:15", "Pack-down and venue handback", "Venue Lead", "Count assets and confirm collection and sign-off."],
];

const KINDS: Record<string, KindSpec> = {
  supplier: {
    noun: "a supplier", add: "Add supplier", empty: "No suppliers listed yet.",
    defaults: { status: "Shortlisted" },
    title: (d, i) => `${str(d.name) || `Supplier ${i + 1}`}${d.service ? ` · ${str(d.service)}` : ""}`,
    fields: {
      name: { t: "text", label: "Supplier", half: true },
      service: {
        t: "select", label: "Provides", half: true,
        opts: ["Venue", "Catering", "Production", "Livestream", "Photography", "Videography", "Print", "Signage", "Furniture", "Freight", "Staffing", "Security", "Other"],
      },
      contact: { t: "text", label: "Contact", half: true },
      status: { t: "select", label: "Status", opts: ["Shortlisted", "Quoted", "In approval", "Contracted", "Purchase order raised", "Delivered"], half: true },
      pay: { t: "date", label: "Next payment date", third: true },
      cancel: { t: "date", label: "Cancellation milestone", third: true },
      contract: { t: "url", label: "Contract or quote (link)", third: true },
      scope: { t: "area", label: "Scope and notes", ph: "Quantities, call times, deliverables, who sets up and removes", rows: 2 },
    },
  },
  attendee: {
    noun: "an attendee", add: "Add person", empty: "Nobody listed yet.",
    defaults: { status: "Invited", mode: "In person" },
    title: (d, i) => `${str(d.name) || `Person ${i + 1}`}${d.type ? ` · ${str(d.type)}` : ""}`,
    fields: {
      name: { t: "text", label: "Name", half: true },
      role: { t: "text", label: "Role at the event", ph: "Keynote, panellist, host of the customer meeting", half: true },
      type: {
        t: "select", label: "Who", third: true,
        opts: ["C-suite executive", "Board member", "Product marketing manager", "Product manager", "Presenter", "Moderator", "Key guest"],
      },
      mode: { t: "select", label: "Attending", opts: ["In person", "Remote"], third: true },
      status: { t: "select", label: "Status", opts: ["Invited", "Confirmed", "Declined"], third: true },
      owner: { t: "text", label: "Confirmation owner", half: true },
      respond: { t: "date", label: "Response date", half: true },
      calendar: { t: "check", label: "Calendar blocked with their Executive Assistant", half: true },
      security: { t: "select", label: "Security review of travel", opts: ["Not needed", "Flagged for review", "Recommendations received", "Actions closed"], half: true },
      liaison: { t: "text", label: "On-site liaison", half: true },
      cover: { t: "text", label: "Cover if they can't attend", half: true },
    },
  },
  session: {
    noun: "a session", add: "Add session", empty: "No sessions yet.",
    defaults: { status: "Draft" },
    title: (d, i) => `${str(d.title) || `Session ${i + 1}`}${d.presenter ? ` · ${str(d.presenter)}` : ""}`,
    fields: {
      title: { t: "text", label: "Session", half: true },
      presenter: { t: "text", label: "Presenter", half: true },
      format: { t: "select", label: "Format", opts: ["Keynote", "Panel", "Fireside chat", "Demo", "Breakout", "Other"], third: true },
      mins: { t: "num", label: "Minutes", third: true },
      use: { t: "select", label: "Permitted use", opts: ["Stream, record and reuse", "Stream and record", "Record only", "Off the record"], third: true },
      takeaway: { t: "area", label: "Audience takeaway", rows: 2 },
      owner: { t: "text", label: "Asset owner", third: true },
      draft: { t: "date", label: "Draft date", third: true },
      approval: { t: "date", label: "Approval deadline", third: true },
      link: { t: "url", label: "Latest approved version (link)" },
      comms: { t: "check", label: "Communications approved", half: true },
      design: { t: "check", label: "Design approved", half: true },
    },
  },
  crew: {
    noun: "a crew member", add: "Add crew", empty: "No crew named yet.",
    title: (d, i) => `${str(d.role) || `Crew ${i + 1}`}${d.name ? ` · ${str(d.name)}` : ""}`,
    fields: {
      role: { t: "select", label: "Role", opts: ["Show caller", "Stage manager", "Camera", "Audio", "Slide operator", "Stream operator", "Remote moderator", "Other"], half: true },
      name: { t: "text", label: "Name", half: true },
      call: { t: "text", label: "Call time", ph: "06:30", half: true },
      channel: { t: "text", label: "Communications channel", ph: "Comms channel 2", half: true },
    },
  },
  promo: {
    noun: "a campaign calendar entry", add: "Add entry", empty: "Nothing on the campaign calendar yet.",
    defaults: { status: "Draft" },
    starter: {
      label: "Start from the workflow's plan",
      rows: PROMO_PLAN.flatMap((row) => PROMO_CHANNELS.map((channel, i) => ({ timing: row[0], channel, asset: row[i + 1] }))),
    },
    title: (d, i) => [str(d.timing), str(d.channel)].filter(Boolean).join(" · ") || `Entry ${i + 1}`,
    fields: {
      timing: { t: "select", label: "Timing", opts: PROMO_PLAN.map((r) => r[0]), third: true },
      channel: { t: "select", label: "Channel", opts: [...PROMO_CHANNELS, "Partner promotion"], third: true },
      status: { t: "select", label: "Status", opts: ["Draft", "Approved", "Scheduled", "Published"], third: true },
      asset: { t: "text", label: "What goes out" },
      audience: { t: "text", label: "Audience", ph: "Public, or invitation only", half: true },
      cta: { t: "text", label: "CTA", half: true },
      owner: { t: "text", label: "Owner", third: true },
      approver: { t: "text", label: "Approver", third: true },
      date: { t: "date", label: "Publish date", third: true },
      link: { t: "url", label: "Tracking link" },
    },
  },
  signage: {
    noun: "a physical asset", add: "Add asset", empty: "No assets listed yet.",
    title: (d, i) => `${str(d.item) || `Asset ${i + 1}`}${d.where ? ` · ${str(d.where)}` : ""}`,
    fields: {
      item: { t: "text", label: "Asset", ph: "Media wall, directional sign, pull-up banner", half: true },
      where: { t: "text", label: "Location", half: true },
      qty: { t: "num", label: "Quantity", third: true },
      size: { t: "text", label: "Dimensions", third: true },
      print: { t: "date", label: "Print deadline", third: true },
      install: { t: "text", label: "Installs it", half: true },
      remove: { t: "text", label: "Removes or collects it", half: true },
      proof: { t: "check", label: "Final proof approved by Communications and Design", half: true },
      delivered: { t: "check", label: "Delivered and checked against the list", half: true },
    },
  },
  roster: {
    noun: "a roster area", add: "Add area", empty: "No one rostered yet.",
    starter: {
      label: "Start from the workflow's seven areas",
      rows: ROSTER.map(([area, support, resp]) => ({ area, support, resp })),
    },
    title: (d, i) => str(d.area) || `Area ${i + 1}`,
    fields: {
      area: { t: "text", label: "Area", half: true },
      support: { t: "text", label: "Support to roster", half: true },
      resp: { t: "area", label: "Responsibilities", rows: 2, half: true },
      people: { t: "area", label: "Who's on, with relief cover", rows: 2, half: true },
    },
  },
  cue: {
    noun: "a run-of-show cue", add: "Add cue", empty: "No cues yet.",
    starter: {
      label: "Start from the example timings",
      rows: RUN_OF_SHOW.map(([time, activity, lead, action]) => ({ time, activity, lead, action })),
    },
    title: (d, i) => [str(d.time), str(d.activity)].filter(Boolean).join(" · ") || `Cue ${i + 1}`,
    fields: {
      time: { t: "text", label: "Local time", ph: "08:25", third: true },
      activity: { t: "text", label: "Activity", third: true },
      lead: { t: "text", label: "Lead", third: true },
      action: { t: "area", label: "Action", rows: 2, half: true },
      fallback: { t: "area", label: "Fallback", rows: 2, half: true },
      where: { t: "text", label: "Location", half: true },
      asset: { t: "text", label: "Asset", ph: "Deck, video, holding slide", half: true },
    },
  },
};

// ── Sections ────────────────────────────────────────────────────────────

// One of the workflow's tasks: its full wording, and the short form the
// section's "Ready when" list and the activity log use.
const T = (k: string, short: string, label: string): FieldSpec => ({ k, t: "task", label, short });
const H = (label: string, hint?: string): FieldSpec => ({ t: "heading", label, hint });

type SectionBody = { fields: FieldSpec[]; reqs?: SectionSpec["reqs"] };

// A section is ready when every one of its tasks is ticked, plus anything
// it adds itself.
function section(outline: MajorSectionOutline, body: SectionBody): SectionSpec {
  const tasks = body.fields.filter((f) => f.t === "task");
  return {
    ...outline,
    fields: body.fields,
    reqs: (c: Ctx) => {
      const v = c.V(outline.k);
      return [
        ...tasks.map((f): [string, boolean] => [f.short ?? f.label ?? "", !!v[f.k ?? ""]]),
        ...(body.reqs ? body.reqs(c) : []),
      ];
    },
  };
}

// By section key (MAJOR_SECTIONS in majorEvent.ts).
const BODIES: Record<string, SectionBody> = {
  brief: {
    fields: [
      T("purpose", "Purpose, audience, format, date and outcomes confirmed", "Confirm the event purpose, audience, format, location, preferred date and intended outcomes. Set separate targets for in-person attendance and online viewing."),
      T("forecast", "Headcount forecast", "Forecast guests, executives, speakers, staff and supplier crew. Confirm who counts towards capacity and who needs a seat or meal."),
      T("naming", "Name, key messages, branding and CTA agreed", "Agree the event name, key messages, use of WiseTech Global and CargoWise branding, and the primary call to action."),
      T("leads", "Workstream leads and deputies named", "Assign named leads for venue, catering, programme, communications, web, registration, production, guest experience and finance. Nominate a deputy for each critical event-day role."),
      T("budget", "Budget approved", "Approve the budget for venue, catering, production, livestream, recording, design, print, freight, staffing, travel and contingency."),
      T("approvers", "Approvers agreed and decisions logged", "Agree who approves scope, spend, external communications and opening the doors. Log decisions in the shared task tracker."),
      H("The brief", "What the tasks above settle, so every workstream reads the same thing."),
      { k: "why", t: "area", label: "Purpose and intended outcomes", rows: 3 },
      { k: "audience", t: "area", label: "Audience and format", ph: "Who it is for, in the room and online, and how the day runs", rows: 2 },
      { k: "tInPerson", t: "num", label: "In-person attendance target", half: true },
      { k: "tOnline", t: "num", label: "Online viewing target", half: true },
      { k: "fGuests", t: "num", label: "Guests", third: true },
      { k: "fExecs", t: "num", label: "Executives and Board", third: true },
      { k: "fSpeakers", t: "num", label: "Speakers", third: true },
      { k: "fStaff", t: "num", label: "Event staff", third: true },
      { k: "fCrew", t: "num", label: "Supplier crew", third: true },
      { k: "fSeats", t: "text", label: "Who needs a seat or meal", third: true },
      { k: "messages", t: "area", label: "Key messages", rows: 3 },
      { k: "cta", t: "text", label: "Primary call to action" },
      { k: "budgetTotal", t: "text", label: "Approved budget", ph: "Amount and currency, including contingency", half: true },
      { k: "approverNames", t: "text", label: "Who approves scope, spend, communications and opening the doors", half: true },
    ],
  },
  contracts: {
    fields: [
      T("briefVenues", "Shortlisted venues briefed", "Brief shortlisted venues on guest numbers, occupancy, layouts, stage, cameras, catering, registration, breakouts, backstage and setup and pack-down windows."),
      T("siteWalk", "Site walked with production and guest experience", "Walk the site with production and guest experience leads. Check sightlines, step-free access, queues, catering flow, loading access, storage and internet."),
      T("capacity", "Capacity confirmed in writing for each layout", "Obtain written capacity confirmation for each proposed layout, including staging, camera platforms, technical desks, aisles and obstructed seats."),
      T("supplierList", "Every external supplier listed", "List every external supplier, including the venue, caterer, production company, livestream crew, photography, videography, print, signage, furniture, freight, staffing and security providers."),
      T("scopes", "Each supplier has a scope", "Give each supplier a scope with quantities, specifications, call times, contacts, deliverables, acceptance criteria and ownership of setup and removal."),
      T("review", "Contracts reviewed through the approval process", "Review each contract through the relevant WiseTech Global approval process. Check inclusions, fees, deposits, overtime, changes, cancellation, rescheduling, insurance and subcontracting."),
      T("rights", "Usage rights, file formats and data handling confirmed", "Confirm content usage rights, file formats, editable files or raw footage where required, and approved data handling where suppliers access guest details."),
      T("executed", "Contracts and purchase orders executed before work starts", "Arrange executed contracts and purchase orders or other required approvals before work starts. Track payment dates, final catering guarantees and cancellation milestones."),
      T("changes", "On-site change approver named", "Name the person who can approve on-site scope or cost changes. Record approved changes in writing and update the budget."),
      { k: "suppliers", t: "group", kind: "supplier", label: "Suppliers", hint: "One row each, with the dates that matter: the next payment and the last day to cancel." },
      { k: "changeApprover", t: "text", label: "Approves on-site scope or cost changes" },
    ],
    reqs: (c) => [["Suppliers listed with a status", c.items("supplier").length > 0]],
  },
  attendance: {
    fields: [
      T("list", "Expected executives, Board, presenters and key guests listed", "List expected C-suite executives, Board members, product marketing managers, product managers, presenters, moderators and key guests. Record role, in-person or remote attendance, confirmation owner and response date."),
      T("confirm", "Every speaker confirmed for their session", "Confirm each speaker, panellist and presenter for their session. Confirm rehearsals, media appearances and customer meetings where applicable."),
      T("calendars", "Calendars blocked with each Executive Assistant", "For each C-suite executive or Board member, confirm with their Executive Assistant (EA) that event attendance, speaking slots, rehearsals and related commitments are blocked in their calendar."),
      T("travel", "Travel dates confirmed with each EA", "Confirm travel dates with the EA and check the calendar includes arrival, departure and transfer windows, with time for rehearsals and briefings."),
      T("securityFlag", "Executive and Board travel flagged for Security review", "Verify with the EA or travel owner that executive and Board travel has been flagged for Security review. Record the owner, submission date and when recommendations are needed."),
      T("securityRecs", "Security recommendations received and actions owned", "Confirm Security has provided recommendations. Record who received them, who owns each action and what remains open. Keep detailed itineraries and recommendations in restricted briefing materials."),
      T("liaison", "On-site liaison and handovers confirmed", "Assign an on-site liaison and confirm arrival handover, reserved seating or green room, stage call and departure handover."),
      T("announce", "Speakers announced; cover agreed for critical sessions", "Announce speakers once their participation and listing are approved. Reconfirm attendance, travel and Security actions at final readiness. Agree cover for critical sessions."),
      {
        k: "people", t: "group", kind: "attendee", label: "Attendance register",
        hint: "Track who, in what role and where things stand. Detailed itineraries and Security recommendations stay in the restricted briefing materials, not here.",
      },
    ],
    reqs: (c) => {
      const people = c.items("attendee").filter((p) => p.d.status !== "Declined");
      return [["Everyone on the register has confirmed", people.length > 0 && people.every((p) => p.d.status === "Confirmed")]];
    },
  },
  content: {
    fields: [
      T("askPmm", "Session objectives and messages from Product Marketing", "Ask the Product Marketing Manager for session objectives, audience takeaways, product positioning, priority messages, approved proof points and calls to action."),
      T("askPms", "Technical detail and demo materials from product managers", "Ask the required product managers and subject matter experts for technical detail, feature availability, accurate claims, screenshots, demo materials and supporting sources."),
      T("askPresenters", "Topics, decks, bios and headshots from presenters", "Ask presenters for topics, titles, outlines, talking points or decks, demos, Q&A prompts, bios, headshots, name pronunciations and rehearsal availability."),
      T("sessions", "Every session confirmed before publication", "Confirm the presenter, topic, format, duration and audience takeaway for every session before publication. Confirm what may be streamed, recorded or reused."),
      T("track", "Every session and asset tracked with an owner and deadline", "Track each session and asset with an owner, draft date, review date, approval deadline and link. Include slides, speaker notes, MC scripts, demos, backup videos, graphics and handouts."),
      T("verify", "Claims and demos verified; presenters confirm fit", "Have product managers verify the claims and demos. Have presenters confirm that the content fits the slot and that they can deliver it."),
      T("reviews", "Communications and Design reviews done", "Have Communications review tone, titles, quotes, product claims, customer references and permitted use. Have Design review branding, accessibility, readability and fit across stage, stream, web, email, social and print."),
      T("handoff", "Approvals recorded and approved files handed off", "Consolidate feedback, assign revisions and record both Communications and Design approvals on the final version. Hand off approved files to production, web, email, social, DSMN8 and print owners."),
      T("rehearse", "Approved show files rehearsed; late changes re-reviewed", "Rehearse the approved show files, demo and playback backups. Route late changes back to relevant reviewers and verify production has the latest approved version."),
      { k: "agenda", t: "group", kind: "session", label: "Sessions and assets", hint: "One row per session: who presents, what may be streamed or reused, and where the latest approved version is." },
    ],
    reqs: (c) => {
      const sessions = c.items("session");
      return [
        ["Sessions listed", sessions.length > 0],
        ["Every session approved by Communications and Design", sessions.length > 0 && sessions.every((s) => !!s.d.comms && !!s.d.design)],
      ];
    },
  },
  production: {
    fields: [
      T("brief", "Production brief issued and quote itemised", "Issue a brief with the floor plan, agenda, audience size, speaker needs, brand assets, livestream audience and recording deliverables. Obtain an itemised quote and confirm what each supplier provides."),
      T("stage", "Stage, screens, audio and speaker kit specified", "Specify stage dimensions and step-free access, backdrop, furniture, lectern, screens, lighting, microphones, room audio, playback, clicker, confidence monitor and speaker timer."),
      T("cameras", "Camera, lighting and audio layout approved with the venue", "Confirm camera positions, sightlines, lighting for faces, audience Q&A and audio feeds for the room, stream and recording. Approve the layout with the venue."),
      T("stream", "Livestream platform, captions and fallback confirmed", "Confirm livestream platform, audience access, watch page, captions, holding slides, speaker graphics, moderation and escalation. Test connectivity under show conditions and agree a fallback."),
      T("recording", "Recording scope and deliverables agreed", "Specify sessions to record and any off-record segments. Agree full-session edits, highlights, captions, transcripts, file formats, delivery dates and any required raw footage."),
      T("crew", "Show caller and crew named with call times", "Name the show caller, stage manager, camera and audio crew, slide operator, stream operator and remote moderator. Record call times and communications channels."),
      T("backups", "Backups tested; local recording survives a dropped stream", "Test spare microphones, backup playback, offline slides and recorded demos. Confirm local recording can continue if the stream drops."),
      T("rehearsals", "Technical and speaker rehearsals run", "Run technical and speaker rehearsals. Check the remote viewer experience, captions, audio and sample recording playback before approving production readiness."),
      H("Broadcast"),
      { k: "platform", t: "text", label: "Livestream platform", half: true },
      { k: "rehearsal", t: "date", label: "Technical and speaker rehearsal", half: true },
      { k: "fallback", t: "area", label: "Fallback if the stream or connection fails", rows: 2 },
      { k: "deliverables", t: "area", label: "Recording deliverables and delivery dates", ph: "Full-session edits, highlights, captions, transcripts, file formats, raw footage", rows: 3 },
      { k: "crewList", t: "group", kind: "crew", label: "Crew", hint: "Who calls the show, who runs each desk, when they're called and how they talk to each other." },
    ],
    reqs: (c) => [["Crew named", c.items("crew").length > 0]],
  },
  web: {
    fields: [
      T("page", "Event page built", "Build the event page with name, purpose, date, time zone, venue or viewing details, agenda, approved speakers, accessibility information, FAQs and a support contact."),
      T("paths", "Registration paths, capacity and rules set", "Confirm the primary call to action and build in-person and online registration paths as needed. Set capacity, seat allocations, RSVP deadline, waitlist and cancellation or transfer rules."),
      T("requests", "Dietary, accessibility and recording information captured", "Capture dietary and accessibility requests and agree access to guest information. Include photography or recording information where applicable."),
      T("confirmations", "Confirmations and watch page built and tested", "Create confirmation pages, emails and calendar entries with the correct venue or online details. Build and test the livestream watch page and agree when joining links will be sent."),
      T("tracking", "Tracked links and reporting set up; page owner assigned", "Set up tracked links and reporting for EDMs, organic social, DSMN8 and partner promotion. Assign an owner to maintain the agenda, speaker details and availability."),
      T("test", "Tested on mobile and desktop, and live after publication", "Test mobile and desktop access, forms, links, time zones, duplicate registration, waitlist, cancellations and confirmations. Complete a live test after publication."),
      T("close", "Registration closed and the page updated after the event", "Close registration after the event and update the page with approved recordings, resources or the next action."),
      H("Links and limits"),
      { k: "pageUrl", t: "url", label: "Event page", half: true },
      { k: "watchUrl", t: "url", label: "Livestream watch page", half: true },
      { k: "capacity", t: "num", label: "In-person registration capacity", third: true },
      { k: "rsvp", t: "date", label: "RSVP deadline", third: true },
      { k: "joinLinks", t: "text", label: "When joining links are sent", third: true },
      { k: "pageOwner", t: "text", label: "Maintains the agenda, speakers and availability" },
    ],
    reqs: (c) => [["Event page link", has(c.V("web").pageUrl)]],
  },
  promo: {
    fields: [
      T("calendar", "One campaign calendar created", "Create one campaign calendar with audience, channel, asset, CTA, owner, approver, publish date, tracking link and status. Confirm which audiences receive public or invitation-only promotion."),
      T("edms", "EDMs drafted and tested; registrants suppressed", "Draft each EDM with subject line, preheader, audience-specific copy, sender details and one primary CTA. Test links, layout and audience selection. Suppress existing registrants from acquisition reminders."),
      T("social", "Organic social posts drafted", "Draft organic social posts for the relevant WiseTech Global or CargoWise channels. Supply approved copy, format-specific creative, alt text, relevant tags, a tracked link and a named publisher."),
      T("dsmn8", "DSMN8 employee advocacy copy created", "Create two or three DSMN8 employee advocacy copy options per milestone, with approved imagery, shared facts, tracked links and a suggested sharing window."),
      T("eventDay", "Event-day copy and assets prepared", "Prepare event-day copy and assets ahead of time. Assign someone to collect photos and quotes and obtain approval before publication."),
      T("review", "Registrations reviewed by channel and outreach adjusted", "Review registrations by channel and audience segment and adjust targeted outreach or reminders as needed."),
      { t: "table", label: "What goes out, and when", head: ["Timing", ...PROMO_CHANNELS], body: PROMO_PLAN },
      { k: "plan", t: "group", kind: "promo", label: "Campaign calendar", hint: "One entry per send or post. Start from the workflow's plan above, then add the audience, owner, approver, date and tracking link to each." },
    ],
    reqs: (c) => [["Campaign calendar has entries", c.items("promo").length > 0]],
  },
  assets: {
    fields: [
      T("list", "Banners, signs, badges and branded items listed", "List banners, registration and directional signs, room signs, stage branding, media walls, badges, reserved signs, table numbers and branded counters."),
      T("map", "Quantities, locations, install and removal mapped", "Map quantities, dimensions, locations, mounting, installation and removal owners. Confirm artwork specs, finishes, print deadlines, freight and installation charges."),
      T("mediaWall", "Media wall, banners and counters confirmed", "Confirm media wall logos, finish, lighting, camera framing, interview space and queue position. Confirm banner and counter setup, transport cases and collection for reuse."),
      T("proofs", "Final proofs approved by Communications and Design", "Have Communications and Design approve final proofs. Check logos, dates, names, QR codes, accessibility information and legibility at intended size."),
      T("deliveries", "Deliveries checked and the install plan shared", "Check deliveries against the asset list, pack by location and share the install and collection plan."),
      { k: "assetList", t: "group", kind: "signage", label: "Asset list" },
    ],
    reqs: (c) => [["Asset list started", c.items("signage").length > 0]],
  },
  seating: {
    fields: [
      H("Seating and arrivals"),
      T("seatingStyle", "Seating style chosen for each room", "Choose open, reserved or assigned seating for each room. Mark VIP, speaker, accessible and companion seats, plus sightlines and technical positions."),
      T("seatingPlan", "Seating plan approved with the venue", "Approve the seating plan with the venue. If seats are assigned, confirm names and table or row numbers and give ushers the current version. Name an owner for late changes."),
      T("checkIn", "Check-in tested, with an exceptions desk and offline fallback", "Estimate peak arrivals and test check-in speed. Assign desks, staff and devices, with a separate exceptions desk and a tested offline fallback."),
      T("ushers", "Ushers briefed; access requests confirmed", "Brief ushers on wayfinding, spare reserved seats, late arrivals and escalation for capacity or accessibility issues. Confirm individual access requests with attendees."),
      H("Catering and dietary requirements"),
      T("menus", "Menus, service style and timings confirmed", "Confirm menus, service style and timings for each break, lunch and networking period. Include water, green-room, VIP, staff and crew catering and drinks arrangements if applicable."),
      T("peak", "Peak-demand service plan agreed", "Agree how service will handle peak demand. Confirm station locations, signage, replenishment, clearing, queue management and staggered staff meals."),
      T("dietary", "Dietary requests reconciled with the caterer", "Reconcile dietary requests with the caterer. Agree how meals will be identified and handed to guests, and nominate an on-site contact for queries and late changes."),
      T("guarantee", "Guaranteed numbers submitted and confirmed in writing", "Submit guaranteed numbers by the contracted deadline. Get written confirmation of guest, staff and crew counts, service times, special meals and late-change charges."),
      H("Guaranteed numbers"),
      { k: "deadline", t: "date", label: "Contracted deadline", half: true },
      { k: "contact", t: "text", label: "On-site contact for dietary queries and late changes", half: true },
      { k: "gGuests", t: "num", label: "Guests", third: true },
      { k: "gStaff", t: "num", label: "Staff", third: true },
      { k: "gCrew", t: "num", label: "Crew", third: true },
      { k: "lateOwner", t: "text", label: "Owns late seating changes" },
    ],
  },
  ready: {
    fields: [
      T("pack", "Final event pack issued", "Issue the final event pack with run of show, floor plans, cue sheets, seating plan, staff roster, supplier contacts, deliveries, venue procedures and escalation contacts."),
      T("briefing", "All event staff briefed", "Brief all event staff on posts, call times, dress, equipment, relief cover and escalation. Check arrangements for executives, speakers and attendees with specific access needs."),
      T("freeze", "Content frozen; arrival details sent; holding messages ready", "Freeze approved decks, videos and scripts. Send joining and arrival details to guests and prepare approved holding messages for delays or programme changes."),
      T("review", "Final readiness review held", "At the final readiness review, confirm suppliers, venue capacity, seating, catering, staffing, production, Communications and outstanding executive travel or Security actions."),
      T("walk", "Site walked after setup; check-in and backups tested", "After setup, walk the site. Verify stage, cameras, banners, media wall, registration, seating, catering stations and accessible routes. Test check-in and production backups."),
      T("doors", "Clearances obtained and the doors decision recorded", "Before opening, obtain venue, production and guest experience clearance. Record the open or hold decision and name owners for any outstanding items."),
      T("cues", "Cues run and changes logged as they happen", "Run each cue with a time, location, named owner, asset and fallback. Log changes, issues and decisions as they happen."),
      H("Readiness"),
      { k: "reviewDate", t: "date", label: "Final readiness review", half: true },
      { k: "doorsDecision", t: "select", label: "Doors decision", opts: ["Open", "Hold"], ph: "Not made yet", half: true },
      { k: "outstanding", t: "area", label: "Outstanding items and their owners", rows: 2 },
      { k: "roster", t: "group", kind: "roster", label: "Event day support roster", hint: "Who covers each area on the day, with relief." },
    ],
    reqs: (c) => [["Support rostered for every area", c.items("roster").length > 0 && c.items("roster").every((r) => has(r.d.people))]],
  },
  show: {
    fields: [
      { k: "cues", t: "group", kind: "cue", label: "Run of show", hint: "Each cue needs a time, a location, a named lead, the asset it uses and a fallback." },
      { k: "log", t: "area", label: "Changes, issues and decisions on the day", ph: "Logged as they happen, with the time", rows: 4 },
    ],
    reqs: (c) => {
      const cues = c.items("cue");
      return [
        ["Run of show built", cues.length > 0],
        ["Every cue has a time and a lead", cues.length > 0 && cues.every((q) => has(q.d.time) && has(q.d.lead))],
        ["Every cue has a fallback", cues.length > 0 && cues.every((q) => has(q.d.fallback))],
      ];
    },
  },
  close: {
    fields: [
      T("reconcile", "Attendance reconciled, in person and online", "Reconcile registrations, unique check-ins, walk-ins, no-shows and online attendance. Report in-person and online figures separately."),
      T("followUps", "Follow-ups sent; recaps published; website updated", "Send the planned EDM follow-ups, survey and approved resources. Publish approved social and DSMN8 recaps and update the event website."),
      T("footage", "Delivered footage reviewed and deliverables signed off", "Review delivered footage, audio, captions, branding and permissions before publishing. Confirm receipt of all contracted files and sign off on outstanding deliverables."),
      T("enquiries", "Enquiries and commitments assigned to owners", "Assign attendee enquiries, sales or customer follow-up, and commitments to named owners with due dates."),
      T("report", "Report against the event objectives", "Report against the event objectives. Include attendance, feedback, channel performance, recording engagement, budget variance and cost per attendee."),
      T("invoices", "Invoices reconciled; returns and final payments confirmed", "Reconcile invoices against contracts, purchase orders and approved changes. Confirm asset returns, final payments and outstanding deliverables."),
      T("debrief", "Debrief held and everything archived", "Debrief with workstream leads, assign improvement actions and archive approved assets, supplier contracts, layouts and the final run of show."),
      H("Attendance", "Report in-person and online figures separately."),
      { k: "regs", t: "num", label: "Registrations", third: true },
      { k: "checkIns", t: "num", label: "Unique check-ins", third: true },
      { k: "walkIns", t: "num", label: "Walk-ins", third: true },
      { k: "noShows", t: "num", label: "No-shows", third: true },
      { k: "online", t: "num", label: "Online attendance", third: true },
      { k: "recViews", t: "num", label: "Recording views", third: true },
      H("Report"),
      { k: "variance", t: "text", label: "Budget variance", half: true },
      { k: "cpa", t: "text", label: "Cost per attendee", half: true },
      { k: "feedback", t: "area", label: "Feedback and channel performance", rows: 3 },
      { k: "improve", t: "area", label: "Improvement actions from the debrief", rows: 3 },
      { k: "reportUrl", t: "url", label: "Event report (link)" },
    ],
    reqs: (c) => [["In-person and online attendance recorded", has(c.V("close").checkIns) && has(c.V("close").online)]],
  },
};

export const MAJOR_DEF: KitDef = majorDef(
  MAJOR_SECTIONS.map((s) => section(s, BODIES[s.k] ?? { fields: [] })),
  KINDS,
);

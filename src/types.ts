export type Priority = "Urgent" | "High" | "Normal" | "Low";

// Lifecycle order is Planning → Active → On hold → Completed. Note that the
// stored value "paused" is displayed as "On hold": the value is already
// persisted on live project docs, and renaming it would need a migration
// where any missed doc would fall through the `?? "active"` default and
// silently reappear as active work. Always render these through
// projectStatusLabel() in constants.ts rather than printing the raw value.
export type ProjectStatus = "planning" | "active" | "paused" | "completed";

// An office location and the time zone it keeps. Managed by super users in
// Settings → Locations & time zones, and shared by everyone: adding one puts
// a clock in every teammate's sidebar.
//
// Deliberately stores an IANA zone id ("Australia/Sydney") rather than a UTC
// offset, so daylight saving is the browser's problem rather than ours —
// Sydney and Chicago are between 15 and 17 hours apart depending on the month.
export type Hub = {
  id: string;
  // Display name, e.g. "Sydney". Free text — it doesn't have to match the
  // city in the zone id.
  name: string;
  // IANA time zone identifier, e.g. "Australia/Sydney".
  timeZone: string;
  // Local hours between which people here are considered contactable. Used
  // only to grey out a clock, never to block anything. A range that wraps
  // past midnight (22 → 6) is valid.
  workStartHour: number;
  workEndHour: number;
};

export type Designer = {
  id: string;
  name: string;
  initials: string;
  color: string;
  email?: string;
  // Which Hub this person sits in. Missing means unassigned — they simply
  // don't get a "you" marker on any clock.
  hubId?: string;
  // User-supplied headshot URL pasted from Settings. Empty / missing falls
  // back to the initials chip.
  photoUrl?: string;
  // Super users are admins: they manage team membership, promote / demote
  // other super users and reviewers, and view the by-designer analytics
  // chart. SUPER_USER_EMAILS in src/constants.ts is the bootstrap so
  // there's always at least one super user who can grant the flag.
  isSuperUser?: boolean;
  // Reviewers appear in the Reviewer picker on every project. Independent
  // from isSuperUser — a designer can be one, both, or neither. Toggled
  // from Settings by a super user.
  isReviewer?: boolean;
};

// A named container that scopes projects + notifications (Design, Video,
// Marketing). Designers stay global; per-workspace membership is opt-in via
// `memberIds` — an empty/missing list means the workspace is open to
// everyone, populating it restricts visibility to listed users (plus
// super-users, who always see every workspace).
export type Workspace = {
  id: string;
  name: string;
  memberIds?: string[];
};

export type Milestone = {
  id: string;
  label: string;
  done: boolean;
};

export type Comment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likes?: string[];
  parentId?: string | null;
};

export type Project = {
  id: string;
  workspaceId: string;
  title: string;
  overview: string;
  client: string;
  brand: string;
  // Legacy single-value content type, kept only so projects written before
  // the field went multi-value still render. Never written to any more —
  // always read through projectContentTypes() in contentTypes.ts, which
  // prefers `contentTypes` and falls back to this.
  contentType?: string;
  contentTypes?: string[];
  briefUrl: string;
  dueDate: string;
  priority: Priority;
  assigneeIds: string[];
  // Designer UIDs of super users who've been asked to review this project.
  // Empty / missing means no review requested. Replaces the old boolean
  // `flaggedForReview` — a project is "flagged" iff reviewerIds is non-empty,
  // and each reviewer only sees projects where their own UID is in this list.
  reviewerIds?: string[];
  status?: ProjectStatus;
  archived?: boolean;
  milestones: Milestone[];
  comments: Comment[];
  createdAt: string;
  source?: "manual" | "outlook" | "teams";
};

export type Notification = {
  id: string;
  workspaceId: string;
  recipientId: string;
  fromName: string;
  projectId: string;
  kind: "comment" | "milestone" | "like" | "reply";
  snippet: string;
  createdAt: string;
  read: boolean;
};

// A single line on somebody's personal My Desk checklist. Private to its
// owner — nothing here is shared with the team, and ticking an item off
// never touches the project it was created from.
//
// The three panels on My Desk are all views over this one list:
//   Today     — !done && !remind && date <= today
//   Upcoming  — !done && (remind || date > today)
//   Completed — done (swept 14 days after completedOn)
//
// `remind: true` parks an item in Upcoming with a countdown instead of
// silently waiting for its date; when remindTime arrives on remindDate the
// sweep in MyDesk converts it into a plain item for today.
export type DeskItem = {
  id: string;
  // Designer id (= Firebase UID) this item belongs to.
  ownerId: string;
  text: string;
  // YYYY-MM-DD, local. The day this item lands on the owner's Today list.
  date: string;
  done: boolean;
  completedOn?: string;
  // How many times this rolled over from an earlier day untouched. Surfaced
  // in the UI because an item that's rolled five times usually needs
  // breaking up rather than doing.
  rolled?: number;
  remind?: boolean;
  // HH:MM, 24h, local. Only meaningful when remind is true.
  remindTime?: string;
  // Set when the sweep promoted a reminder onto the Today list, so the row
  // can explain where it came from.
  fromReminder?: boolean;
  // Optional link back to a project. Purely a shortcut — completing the
  // desk item leaves the project's status alone.
  projectId?: string;
  createdAt: string;
};

// Where a social post is in its life. Mirrors the colour code the marketing
// team used in the original spreadsheet: green cells were published, pink
// pending, red pulled. "backlog" is reserved for the evergreen library —
// reusable copy that isn't tied to any date until someone schedules it.
//
// The stored value "pending" is displayed as "Ready to publish". It's already
// on live post docs, and renaming it would need a migration where a missed
// doc would fall through socialStatusMeta's default and show as Draft. Always
// render through socialStatusMeta() in constants.ts, never the raw value.
// "onHold" is a post that's parked: not cancelled, but not going out yet.
export type SocialPostStatus =
  | "backlog"
  | "draft"
  | "pending"
  | "scheduled"
  | "onHold"
  | "published"
  | "cancelled";

// A kind of social post ("Product - CargoWise", "Thought Leadership"…).
// Posts store the `label`, not the id, so a renamed category has to relabel
// its posts (see relabelSocialPostCategory). `short` is the pill text that
// fits a calendar cell; `color` is a hex the pill and filter take.
export type SocialCategory = {
  id: string;
  label: string;
  short: string;
  color: string;
};

// A hashtag the company wants used consistently. `tag` includes the '#'.
export type SocialHashtag = {
  id: string;
  tag: string;
  // When to use it, e.g. "Every CargoWise product post".
  note?: string;
};

// Team-managed configuration for the Social calendar, kept as a single
// Firestore document (/socialConfig/default) so one subscription brings
// the lot. Edited by super users from Settings → Social calendar. When the
// document doesn't exist yet the app runs on the defaults in constants.ts.
export type SocialConfig = {
  categories: SocialCategory[];
  hashtags: SocialHashtag[];
  // Content types a project can be tagged with (Web, Email, Video…), as
  // chips in the project editor. Optional on the stored document because it
  // was added after the first version; App fills in CONTENT_TYPES when it's
  // missing.
  contentTypes?: string[];
  // The types a campaign milestone can be (EDM, Landing Page…). Optional
  // for the same reason; App fills in DEFAULT_MILESTONE_TYPES.
  milestoneTypes?: MilestoneType[];
};

// One option in a campaign milestone's type picker. A `social` type puts a
// draft post on the Social calendar when the milestone is saved.
export type MilestoneType = {
  id: string;
  label: string;
  social: boolean;
};

// One entry on the shared Social calendar: a LinkedIn post going out on a
// brand channel (CargoWise, WiseTech). Shared by everyone, not scoped to a
// workspace — the calendar is the marketing team's single plan, and the
// designers producing the assets need to see the same view.
//
// Imported from "Social Media Calendar 2026.xlsx" by
// scripts/social-calendar-xlsx-to-seed.py; the field names follow that
// sheet's columns so the two stay easy to reconcile.
export type SocialPost = {
  id: string;
  // YYYY-MM the post is planned for. Always set, even while `date` is empty,
  // so an unscheduled post still lands in the right month's tray instead of
  // disappearing.
  month: string;
  // YYYY-MM-DD publish date, local. Empty while the post is unscheduled.
  date: string;
  // Brand account it goes out on. Free text with suggestions rather than an
  // enum: the sheet had "CargoWise" and "WiseTech", but a new channel
  // shouldn't need a deploy.
  channel: string;
  // What kind of post this is — "Product - CargoWise", "Thought
  // Leadership", "Event"… The `label` of a SocialCategory from SocialConfig
  // (defaults in constants.ts), which also gives each its pill colour.
  // Optional: the imported 2026 posts have none until someone sets it.
  category?: string;
  topic: string;
  // Full post copy, newlines preserved.
  copy: string;
  // Links (or occasionally bare file names) as they appeared in the sheet.
  // Not validated as URLs — an asset can legitimately be "Video when ready".
  screenshot: string;
  asset: string;
  ctaLink: string;
  status: SocialPostStatus;
  notes: string;
  // Who's driving the post. Free text ("Maddie", "Jess R.") because the
  // marketing team isn't necessarily on Waypoint as designers.
  owner: string;
  // True for reusable posts in the evergreen library. They keep their
  // `month` (the month they were written) and normally have no `date`; one
  // that does get scheduled shows on the calendar and stays in the library.
  evergreen: boolean;
  // The board project this post promotes or was produced under, if any.
  // The project's detail window lists every post that points at it. Left
  // dangling if the project is deleted — the editor shows that plainly.
  projectId?: string;
  // Link to the live post on LinkedIn once it's up. Pasted by whoever posted
  // it — publishing goes through LinkedIn's own composer, so there's no API
  // response to take this from.
  postUrl?: string;
  // ISO timestamp of when someone marked the post published in Waypoint.
  publishedAt?: string;
  createdAt: string;
  source?: "import" | "manual";
};

// A dated moment inside a campaign — "EDM 1 sent", "Landing page live",
// "Webinar". `done` is the flag the team flips once it has happened.
export type CampaignMilestone = {
  id: string;
  // YYYY-MM-DD, local. Normally inside the campaign's date range, but not
  // enforced — a teaser can go out before launch.
  date: string;
  // One of CAMPAIGN_MILESTONE_TYPES in campaigns.ts. Milestones written
  // before the list existed keep whatever free text they had.
  label: string;
  done: boolean;
  // The draft post a social milestone created on the Social calendar (see
  // milestoneSocialPost in campaigns.ts). Set once, on the save that adds
  // the milestone; left pointing at nothing if the post is deleted.
  socialPostId?: string;
  // Where the milestone's asset lives: the landing page, the EDM's web
  // version, the press release. Shown on the campaign's SharePoint page.
  // A social milestone uses its post's live link (postUrl) instead.
  url?: string;
  // A line or two on what the milestone is: "Launch email to the APAC
  // list". Shown under its type on the campaign's SharePoint page.
  description?: string;
};

// A marketing campaign: a named span of dates with milestones inside it.
// Drawn as a bar across the campaign strip above the Social calendar, and
// optionally overlaid on the post calendar so posts can be scheduled around
// it. Stored in /campaigns, shared by everyone.
export type Campaign = {
  id: string;
  name: string;
  // Legacy: the social channel early campaigns were filed under. No longer
  // shown or written; `category` replaced it.
  channel?: string;
  // What kind of campaign — the same category list the Social calendar's
  // posts use (SocialConfig.categories, by label), so a Product - CargoWise
  // campaign and its Product - CargoWise posts filter together.
  category?: string;
  // Which brand the campaign is for — one of BRANDS in constants.ts. Gives
  // the campaign its colour (brandColor) everywhere it's drawn.
  brand: string;
  // The owner's display name. Kept for the SharePoint page and the CSV,
  // and for campaigns written before owners were picked from the team.
  owner: string;
  // The Designer running the campaign. Works like a project's assignees:
  // the campaign and its milestones show on this person's My Desk.
  ownerId?: string;
  description: string;
  // Inclusive YYYY-MM-DD range. An evergreen campaign has a start but no
  // end: its endDate is empty (older ones may still carry a stale date,
  // which is ignored while the flag is set).
  startDate: string;
  endDate: string;
  // An always-on campaign: runs from its start date with no end. Drawn on
  // both calendars from that day on, and listed under every month after it.
  evergreen?: boolean;
  // Hex colour for the bar. Derived from `brand` on save and stored so the
  // calendar can paint without a lookup; campaigns written before brands
  // existed keep whatever colour they had.
  color: string;
  milestones: CampaignMilestone[];
  // Board projects contributing to this campaign — the EDM, the landing
  // page, the social assets. Each project's window lists the campaigns it
  // belongs to.
  projectIds: string[];
  // Random token behind the campaign's SharePoint page (campaignExport.ts).
  // Set the first time someone downloads the page and never changed after,
  // since every copy of the page already hosted holds it. The page's public
  // copy lives at /campaignPages/{shareToken}, never under the id, so a
  // campaign can't be read from outside by guessing its id.
  shareToken?: string;
  // Where that page lives on SharePoint, pasted back by whoever uploaded it
  // (SharePointGuideModal). Linked from the campaign's editor and card.
  sharePointUrl?: string;
  // The webinar kit workspace, for a campaign of type Webinar: the nine
  // kit sections with their status, due dates, fields, repeatable rows,
  // files, notes and activity. See webinarKit.ts. Lives on the campaign
  // document so one subscription brings the whole pipeline.
  webinar?: WebinarKit;
  createdAt: string;
};

// ── The webinar kit ─────────────────────────────────────────────────────
// A webinar is a campaign worked through the 2026 webinar kit: nine
// sections from brief to results, each due a set number of weeks before
// or after go-live. Definitions of the sections, their fields and the
// schedule maths are in webinarKit.ts; this is just what's stored.

export type KitSectionStatus = "todo" | "doing" | "review" | "done" | "blocked" | "na";

export type KitStage =
  | "proposed"
  | "planning"
  | "production"
  | "promotion"
  | "post"
  | "complete"
  | "hold"
  | "cancelled";

// A field value: text, a number, a flag, or a list of picked options.
export type KitValue = string | number | boolean | string[];

// One repeatable row (a speaker, a run-of-show segment, an email…).
export type KitItem = {
  id: string;
  // KINDS key in webinarKit.ts: speaker, ros, runsheet, social…
  kind: string;
  // Sub-list within a kind, for checklists' extra items.
  list?: string;
  order: number;
  d: Record<string, KitValue>;
  by?: string;
  at: string;
};

export type KitFile = {
  id: string;
  // Section key, or "" for the project as a whole.
  section: string;
  name: string;
  url: string;
  by?: string;
  at: string;
};

export type KitNote = {
  id: string;
  section: string;
  text: string;
  by?: string;
  at: string;
};

export type KitActivity = {
  id: string;
  section: string;
  what: string;
  detail?: string;
  by?: string;
  at: string;
};

export type KitSectionState = {
  status?: KitSectionStatus;
  // A due date set by hand, overriding the kit's schedule (YYYY-MM-DD).
  due?: string;
  // Designer id assigned to the section, overriding the role's team.
  who?: string;
  by?: string;
  at?: string;
};

export type WebinarKit = {
  stage: KitStage;
  // TYPES key: tl, pdd, mpu.
  type: string;
  delivery: "live" | "prerecorded";
  // FORMATS key: panel, keynote, fireside. Empty until confirmed.
  format: string;
  // PHASES key, or empty.
  phase: string;
  series: string;
  ep?: number;
  // The date every due date counts back from (YYYY-MM-DD).
  goLive: string;
  // For a pre-recorded webinar, production sections are due against this.
  recordDate: string;
  // Working title, final title, sessions and time zones, duration, folder.
  wt: string;
  ft: string;
  sessions: string;
  duration: string;
  folder: string;
  // Designer id of the project lead.
  lead?: string;
  // Designer ids per role (ROLES key in webinarKit.ts).
  team: Record<string, string[]>;
  sec: Record<string, KitSectionState>;
  // Field values per section key, keyed by field key (composite keys like
  // "approval|ok" for a field's parts).
  values: Record<string, Record<string, KitValue>>;
  items: KitItem[];
  files: KitFile[];
  notes: KitNote[];
  activity: KitActivity[];
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

// A webinar speaker, saved once in /speakers so they can be added to any
// webinar's speaker list. A webinar's speaker row keeps its own copy of
// the details (so a brief reads as it did when it was written) and the
// speaker's id in `d.speakerId`, which links it back here.
export type Speaker = {
  id: string;
  name: string;
  // Title and organisation, as they appear on a landing page.
  title: string;
  bio: string;
  // A link to the high-res headshot: SharePoint, IntelligenceBank or a
  // direct image link.
  headshot: string;
  linkedin?: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

// The in-memory snapshot of everything App.tsx needs to render. Loaded
// progressively via the Firestore subscriptions in firestore.ts.
export type WorkspaceData = {
  designers: Designer[];
  workspaces: Workspace[];
  projects: Project[];
  notifications: Notification[];
  hubs: Hub[];
};

// Where an event is in its life. Prospect → Planning → Confirmed → Live →
// Done, or Cancelled. The stored value is what the team set; eventPhase()
// in events.ts moves a confirmed event to Live and Done by its dates, so
// always display through that rather than the raw value.
export type EventStatus =
  | "prospect"
  | "planning"
  | "confirmed"
  | "live"
  | "done"
  | "cancelled";

// The ten things to have done around an event, in the order they happen.
// EVENT_CHECKLIST in events.ts gives each its label; the last three are
// what "needs follow-up" looks at once the event is over.
export type EventChecklist = {
  budgetApproved: boolean;
  boothBooked: boolean;
  campaignCodeCreated: boolean;
  travelBooked: boolean;
  collateralReady: boolean;
  bookWithMeLive: boolean;
  leadScanningArranged: boolean;
  feedbackFormSent: boolean;
  reportFiled: boolean;
  resultsLogged: boolean;
};

// A trade show, conference or industry meeting the team attends, sponsors
// or exhibits at. Stored in /events, shared by everyone. Imported from the
// CargoWise Event Portal export by scripts/event-portal-md-to-seed.py; the
// field names follow the portal's so the two stay easy to reconcile.
//
// Named MarketingEvent rather than Event so it doesn't shadow the DOM's
// Event type in the files that use it.
export type MarketingEvent = {
  id: string;
  name: string;
  status: EventStatus;
  // The planning year the event is filed under (the portal's 2026 / 2027
  // sheets). Always set, so an event whose dates are TBC still has a year.
  year: number;
  // Inclusive YYYY-MM-DD run, local. Both empty while the dates are TBC.
  startDate: string;
  endDate: string;
  // YYYY-MM when only the month is known ("Feb 2026 (TBC)"). Left off when
  // the dates are set, or when not even the month is known.
  tbcMonth?: string;
  // The organiser's own wording of the dates, as published.
  datesAsPublished?: string;
  // Which part of the business runs it: CargoWise or Landside. Free text
  // with those as suggestions (EVENT_DIVISIONS in events.ts).
  division: string;
  // Sales region: Americas, EMEA, LATAM, APAC… (EVENT_REGIONS). Optional,
  // free text.
  region?: string;
  location?: string;
  // Who goes, in the organiser's words: size and make-up of the crowd.
  audience?: string;
  // Our presence. Each flag can carry a note ("Bronze sponsor", "8 sqm",
  // "attend in partner booth").
  sponsor?: boolean;
  sponsorNote?: string;
  booth?: boolean;
  boothNote?: string;
  // Attending as visitors to sell, rather than exhibiting.
  attendAndSell?: boolean;
  // Who's speaking, on what, when.
  speakingOpportunity?: string;
  // People. Free text: the events and sales teams aren't necessarily on
  // Waypoint as designers.
  marketingLead?: string;
  salesLead?: string;
  salesAttendeeCount?: number;
  salesAttendees?: string;
  academyAttendee?: string;
  partnerAttendees?: string;
  // The CRM campaign code leads are logged against (CMP00009904).
  campaignCode?: string;
  // A Waypoint campaign this event is part of, if any.
  campaignId?: string;
  // Board projects producing work for the event — the booth graphics, the
  // presentation, the social posts.
  projectIds: string[];
  // File names, as the team records them.
  presentation?: string;
  feedbackDoc?: string;
  // What it costs, in the currency it was invoiced in, plus the fixed-rate
  // US dollar figure (toUsd in events.ts) so events can be compared.
  investment?: number;
  currency?: string;
  investmentUsd?: number;
  costDetails?: string;
  // Results logged after the event: conversations had, opportunities
  // opened, and the breakdown of those by tier ("2 Gold · 2 Silver").
  comms?: number;
  opps?: number;
  oppsBreakdown?: string;
  notes?: string;
  checklist: EventChecklist;
  // The on-site plan for attendees (stand shifts, sessions, meetings,
  // meals), edited from the event and put on SharePoint as a page. Travel
  // and accommodation are deliberately not part of it: each attendee books
  // their own.
  itinerary?: EventItinerary;
  // Random token behind the itinerary's SharePoint page (itineraryExport.ts),
  // set on the first download and never changed; the page's public copy is
  // at /itineraryPages/{itineraryShareToken}.
  itineraryShareToken?: string;
  // Where that page lives on SharePoint, pasted back by whoever uploaded it.
  itinerarySharePointUrl?: string;
  createdAt: string;
  source?: "import" | "manual";
};

// What kind of thing an itinerary item is. Each has its own mark on the
// page's timeline: meetings a filled circle, stand and setup a hollow one,
// meals and networking a square, sessions and speaking a diamond.
export type ItineraryItemType = "meeting" | "stand" | "meal" | "session";

// One line on a day's timeline. Times are HH:MM (24h) or empty; `end` is
// empty for a point in time. `attending` names people from the itinerary's
// "Who's attending" list; `also` is anyone else (a customer, the stand
// builder). Strings rather than optional fields so the editor's rows are
// simple; empty means not set.
export type ItineraryItem = {
  id: string;
  start: string;
  end: string;
  type: ItineraryItemType;
  title: string;
  details: string;
  attending: string;
  also: string;
};

export type ItineraryDay = {
  // YYYY-MM-DD. Normally one of the event's days.
  date: string;
  // Which of the itinerary's cities the day is in, by name.
  city: string;
  // "Stand build", "Show day 1".
  title: string;
  note: string;
  items: ItineraryItem[];
};

// A labelled line in one of the itinerary's tables: a person and their
// role, "Venue" and its address, a contact and who they are.
export type ItineraryRow = {
  id: string;
  label: string;
  value: string;
  note: string;
};

export type ItineraryCity = {
  id: string;
  name: string;
  // Hex colour, used for the day headings in that city.
  color: string;
};

// The attendee itinerary for an event, as the CargoWise Event Itinerary
// Planner lays it out: the event header, its cities, who's attending, the
// venue and stand, optional contacts / shifts / shipping, then a timeline
// per day. itinerary.ts drafts one from the event and runs the checks.
export type EventItinerary = {
  // A line under the event name: the venue, the city, the theme.
  headerLine: string;
  cities: ItineraryCity[];
  // label = name, value = role.
  attendees: ItineraryRow[];
  // A note under the attendee list, e.g. the dress code.
  attendeesNote: string;
  // Venue, Stand, Opening hours, Badge collection… label = what, value =
  // where/when, note = the detail.
  venue: ItineraryRow[];
  contacts: ItineraryRow[];
  standShifts: ItineraryRow[];
  shipping: ItineraryRow[];
  days: ItineraryDay[];
  // The ids of the manual checks (MANUAL_CHECKS in itinerary.ts) ticked off.
  manualChecks: string[];
  updatedAt: string;
};

// Something a reader of the itinerary's SharePoint page added to one of its
// days, without being signed in to anything. Written by the page through
// Firestore's REST API to /itineraryPages/{token}/additions, where the
// rules take a create from anyone who holds the token and nothing else.
// Shown on the page straight away, marked as an addition, and listed in
// the itinerary editor, where the organiser folds it into the day or
// dismisses it. The same fields as an ItineraryItem, plus who added it.
export type ItineraryAddition = {
  id: string;
  date: string;
  start: string;
  end: string;
  type: ItineraryItemType;
  title: string;
  details: string;
  attending: string;
  // The reader's name, as they typed it.
  name: string;
  createdAt: string;
};

// An attendee's own travel and accommodation, entered on the itinerary's
// SharePoint page so the team can see who arrives when and where everyone
// is staying. Each attendee books their own; this is just the record of
// it. Written and updated by the page through Firestore's REST API to
// /itineraryPages/{token}/travel, free text throughout.
export type ItineraryTravel = {
  id: string;
  name: string;
  // "Mon 26 Oct, QF11 lands MIA 6:40pm"
  arrive: string;
  depart: string;
  // Hotel name and address, and the nights if they differ from the event.
  hotel: string;
  mobile: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

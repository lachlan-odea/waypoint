// What changed, in people terms, between two versions of a document: who
// was newly added, and in what capacity. Pure functions over the stored
// shapes, so the triggers in index.ts only have to look people up and send.
//
// Every "reason" is a phrase that reads after "added you to … on Waypoint":
// "as an assignee", "as the lead", "on the Design team".

export type ProjectDoc = {
  id?: string;
  title?: string;
  overview?: string;
  client?: string;
  brand?: string;
  contentType?: string;
  contentTypes?: string[];
  briefUrl?: string;
  priority?: string;
  dueDate?: string;
  status?: string;
  workspaceId?: string;
  assigneeIds?: string[];
  reviewerIds?: string[];
  milestones?: { label?: string; done?: boolean }[];
  updatedBy?: string;
};

export type KitSectionDoc = { who?: string; due?: string; status?: string };

export type WebinarKitDoc = {
  stage?: string;
  type?: string;
  delivery?: string;
  goLive?: string;
  recordDate?: string;
  wt?: string;
  ft?: string;
  sessions?: string;
  duration?: string;
  lead?: string;
  team?: Record<string, string[]>;
  sec?: Record<string, KitSectionDoc>;
};

export type CampaignMilestoneDoc = {
  date?: string;
  label?: string;
  done?: boolean;
  description?: string;
};

export type CampaignDoc = {
  id?: string;
  name?: string;
  brand?: string;
  category?: string;
  owner?: string;
  ownerId?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  evergreen?: boolean;
  milestones?: CampaignMilestoneDoc[];
  projectIds?: string[];
  webinar?: WebinarKitDoc;
  updatedBy?: string;
};

export type EventDoc = {
  id?: string;
  name?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  tbcMonth?: string;
  datesAsPublished?: string;
  division?: string;
  region?: string;
  location?: string;
  audience?: string;
  sponsor?: boolean;
  sponsorNote?: string;
  booth?: boolean;
  boothNote?: string;
  attendAndSell?: boolean;
  speakingOpportunity?: string;
  marketingLead?: string;
  salesLead?: string;
  campaignCode?: string;
  campaignId?: string;
  projectIds?: string[];
  notes?: string;
  updatedBy?: string;
};

// Designer id → the reasons they were added, in the order found.
export type Additions = Map<string, string[]>;

function add(into: Additions, id: string | undefined, reason: string): void {
  if (!id) return;
  const list = into.get(id) ?? [];
  if (!list.includes(reason)) list.push(reason);
  into.set(id, list);
}

function newIds(before: string[] | undefined, after: string[] | undefined): string[] {
  const seen = new Set(before ?? []);
  return (after ?? []).filter((id) => id && !seen.has(id));
}

export function projectAdditions(before: ProjectDoc | undefined, after: ProjectDoc): Additions {
  const out: Additions = new Map();
  newIds(before?.assigneeIds, after.assigneeIds).forEach((id) => add(out, id, "as an assignee"));
  newIds(before?.reviewerIds, after.reviewerIds).forEach((id) => add(out, id, "as a reviewer"));
  return out;
}

// Keep in step with ROLES in src/webinarKit.ts.
export const WEBINAR_ROLE_LABELS: Record<string, string> = {
  pmm: "Product Marketing",
  producer: "Production support",
  digital: "Digital Marketing",
  video: "Video",
  design: "Design",
  sales: "Sales & Partner Enablement",
  partner: "Partner & Industry Marketing",
  comms: "Comms",
  sme: "SMEs & product managers",
};

// Keep in step with SECTIONS in src/webinarKit.ts.
export const WEBINAR_SECTION_TITLES: Record<string, string> = {
  brief: "01 Webinar brief",
  core: "02 Core message & value",
  landing: "03 Landing page & promotion inputs",
  confirm: "04 Speakers, run of show & assets",
  runsheet: "05 Runsheet & storyboard",
  prepromo: "06 Pre-promotion",
  final: "07 Final checks",
  post: "08 Post-promotion",
  results: "09 Results & learnings",
};

export function campaignAdditions(before: CampaignDoc | undefined, after: CampaignDoc): Additions {
  const out: Additions = new Map();
  const kit = after.webinar;
  if (!kit) {
    if (after.ownerId && after.ownerId !== before?.ownerId) add(out, after.ownerId, "as the owner");
    return out;
  }

  const kitBefore = before?.webinar;
  const newLead = kit.lead && kit.lead !== kitBefore?.lead ? kit.lead : undefined;
  add(out, newLead, "as the lead");
  // A webinar's owner is its lead; only say "owner" when they differ.
  if (after.ownerId && after.ownerId !== before?.ownerId && after.ownerId !== kit.lead) {
    add(out, after.ownerId, "as the owner");
  }
  for (const [role, ids] of Object.entries(kit.team ?? {})) {
    const label = WEBINAR_ROLE_LABELS[role] ?? role;
    newIds(kitBefore?.team?.[role], ids).forEach((id) => {
      // The lead is on the Product Marketing team by construction; one
      // reason is enough for them.
      if (id === newLead) return;
      add(out, id, `on the ${label} team`);
    });
  }
  for (const [key, state] of Object.entries(kit.sec ?? {})) {
    const who = state?.who;
    if (!who || who === kitBefore?.sec?.[key]?.who) continue;
    add(out, who, `as owner of ${WEBINAR_SECTION_TITLES[key] ?? key}`);
  }
  return out;
}

// Events name their leads in free text (the events and sales teams aren't
// all on Waypoint), so additions come back as names for the caller to
// match against the designer directory.
export type NamedAddition = { name: string; reason: string };

export function eventLeadAdditions(before: EventDoc | undefined, after: EventDoc): NamedAddition[] {
  const out: NamedAddition[] = [];
  const fields: [keyof EventDoc, string][] = [
    ["marketingLead", "as the marketing lead"],
    ["salesLead", "as the sales lead"],
  ];
  for (const [field, reason] of fields) {
    const now = splitNames(String(after[field] ?? ""));
    const was = new Set(splitNames(String(before?.[field] ?? "")).map(normaliseName));
    now
      .filter((n) => !was.has(normaliseName(n)))
      .forEach((name) => out.push({ name, reason }));
  }
  return out;
}

// "Alice Smith / Bob Jones", "Alice & Bob", "Alice, Bob and Carol" → each name.
export function splitNames(field: string): string[] {
  return field
    .split(/\s*(?:,|\/|&|;|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// ── Dates ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function parseIso(iso: string | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "Mon 2 Mar 2026".
export function formatDate(iso: string | undefined): string {
  const d = parseIso(iso);
  if (!d) return iso ?? "";
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "today", "tomorrow", "in 12 days", "3 days ago".
export function relativeDays(iso: string | undefined, now = new Date()): string {
  const d = parseIso(iso);
  if (!d) return "";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.round((d.getTime() - today) / DAY_MS);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return diff < 14 ? `in ${diff} days` : `in ${Math.round(diff / 7)} weeks`;
  const ago = -diff;
  return ago < 14 ? `${ago} days ago` : `${Math.round(ago / 7)} weeks ago`;
}

// "Mon 2 Mar 2026 (in 12 days)".
export function dateWithCountdown(iso: string | undefined, now = new Date()): string {
  const text = formatDate(iso);
  if (!text) return "";
  const rel = relativeDays(iso, now);
  return rel ? `${text} (${rel})` : text;
}

function formatRange(start: string | undefined, end: string | undefined): string {
  if (start && end && start !== end) return `${formatDate(start)} to ${formatDate(end)}`;
  return formatDate(start) || formatDate(end);
}

// The When row of an event email, from whichever date fields are set.
export function describeEventDates(e: EventDoc): string {
  if (e.datesAsPublished) return e.datesAsPublished;
  const range = formatRange(e.startDate, e.endDate);
  if (range) {
    const rel = relativeDays(e.startDate);
    return rel ? `${range} (${rel})` : range;
  }
  if (e.tbcMonth) {
    const [y, m] = e.tbcMonth.split("-");
    const label = formatDate(`${y}-${m}-01`).replace(/^\w+ 1 /, "");
    return `${label} (TBC)`;
  }
  return "Dates TBC";
}

export function describeCampaignDates(c: CampaignDoc): string {
  if (c.evergreen) return `Always on from ${formatDate(c.startDate)}`.trim();
  return formatRange(c.startDate, c.endDate);
}

// Keep in step with STATUS labels in src/constants.ts.
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  paused: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function describeContentTypes(p: ProjectDoc): string {
  const list = p.contentTypes && p.contentTypes.length > 0 ? p.contentTypes : p.contentType ? [p.contentType] : [];
  return list.filter(Boolean).join(", ");
}

export function describeMilestones(p: ProjectDoc): string {
  const all = p.milestones ?? [];
  if (all.length === 0) return "";
  const done = all.filter((m) => m.done).length;
  return `${done} of ${all.length} done`;
}

// The campaign's next few undone milestones, soonest first.
export function upcomingMilestones(c: CampaignDoc, max = 4, now = new Date()): string[] {
  const todayIso = now.toISOString().slice(0, 10);
  return (c.milestones ?? [])
    .filter((m) => !m.done && m.date && m.date >= todayIso)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, max)
    .map((m) => `${formatDate(m.date)}: ${m.label ?? "Milestone"}${m.description ? ` – ${m.description}` : ""}`);
}

// What we're doing at an event: "Sponsor (Bronze), booth (8 sqm), attending to sell".
export function describePresence(e: EventDoc): string {
  const parts: string[] = [];
  if (e.sponsor) parts.push(e.sponsorNote ? `Sponsor (${e.sponsorNote})` : "Sponsor");
  if (e.booth) parts.push(e.boothNote ? `Booth (${e.boothNote})` : "Booth");
  if (e.attendAndSell) parts.push("Attending to sell");
  return parts.join(", ");
}

// Keep in step with EVENT_STATUS labels in src/events.ts.
export const EVENT_STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  planning: "Planning",
  confirmed: "Confirmed",
  live: "Live",
  done: "Done",
  cancelled: "Cancelled",
};

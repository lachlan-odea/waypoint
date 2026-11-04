// What changed, in people terms, between two versions of a document: who
// was newly added, and in what capacity. Pure functions over the stored
// shapes, so the triggers in index.ts only have to look people up and send.
//
// Every "reason" is a phrase that reads after "added you to … on Waypoint":
// "as an assignee", "as the lead", "on the Design team".

export type ProjectDoc = {
  id?: string;
  title?: string;
  brand?: string;
  priority?: string;
  dueDate?: string;
  workspaceId?: string;
  assigneeIds?: string[];
  reviewerIds?: string[];
  updatedBy?: string;
};

export type KitSectionDoc = { who?: string };

export type WebinarKitDoc = {
  stage?: string;
  type?: string;
  delivery?: string;
  goLive?: string;
  lead?: string;
  team?: Record<string, string[]>;
  sec?: Record<string, KitSectionDoc>;
};

export type CampaignDoc = {
  id?: string;
  name?: string;
  brand?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  evergreen?: boolean;
  ownerId?: string;
  webinar?: WebinarKitDoc;
  updatedBy?: string;
};

export type EventDoc = {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  tbcMonth?: string;
  datesAsPublished?: string;
  location?: string;
  division?: string;
  marketingLead?: string;
  salesLead?: string;
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

// The When row of an event email, from whichever date fields are set.
export function describeEventDates(e: EventDoc): string {
  if (e.datesAsPublished) return e.datesAsPublished;
  if (e.startDate && e.endDate && e.startDate !== e.endDate) return `${e.startDate} to ${e.endDate}`;
  if (e.startDate) return e.startDate;
  if (e.tbcMonth) return `${e.tbcMonth} (TBC)`;
  return "Dates TBC";
}

export function describeCampaignDates(c: CampaignDoc): string {
  if (c.evergreen) return "Always on";
  if (c.startDate && c.endDate) return `${c.startDate} to ${c.endDate}`;
  return c.startDate ?? "";
}

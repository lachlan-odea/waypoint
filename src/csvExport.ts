import type { Campaign, MarketingEvent, SocialPost } from "./types";
import { socialStatusMeta } from "./constants";
import { campaignOverlaps, spanDays } from "./campaigns";
import {
  EVENT_CHECKLIST,
  checklistDone,
  eventOverlaps,
  eventPhase,
  eventSortKey,
  eventStatusMeta,
  fiscalYear,
  followUpMissing,
} from "./events";

// CSV downloads of the Social calendar and the Campaigns calendar over a
// chosen date range. Written for Excel first, since that's where the
// marketing team opens them: a UTF-8 BOM so accented names survive, CRLF
// line ends, and every cell quoted.

// A cell starting with one of these is read by Excel as a formula, and post
// copy is free text pasted from anywhere. A leading apostrophe makes it
// plain text again and is hidden by Excel.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | boolean | undefined): string {
  let s = value === undefined ? "" : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: string[],
  rows: (string | number | boolean | undefined)[][],
): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvFileName(what: string, from: string, to: string): string {
  return `${what}-${from}-to-${to}.csv`;
}

// ── Social calendar ──────────────────────────────────────────────────────

// Posts in the range: dated ones by their date, and — when asked for —
// unscheduled ones by the month they're planned for, if any of that month
// falls inside the range. Undated evergreen posts belong to the library,
// not to any stretch of the calendar, so they never come along.
export function socialPostsInRange(
  posts: SocialPost[],
  from: string,
  to: string,
  includeUnscheduled: boolean,
): SocialPost[] {
  return posts
    .filter((p) =>
      p.date
        ? p.date >= from && p.date <= to
        : includeUnscheduled &&
          !p.evergreen &&
          !!p.month &&
          p.month >= from.slice(0, 7) &&
          p.month <= to.slice(0, 7),
    )
    .sort(
      (a, b) =>
        (a.date || `${a.month}-99`).localeCompare(b.date || `${b.month}-99`) ||
        a.channel.localeCompare(b.channel) ||
        a.topic.localeCompare(b.topic),
    );
}

export function socialPostsCsv(
  posts: SocialPost[],
  projectTitle: (id: string) => string | undefined,
): string {
  return toCsv(
    [
      "Date",
      "Month",
      "Channel",
      "Type",
      "Topic",
      "Status",
      "Owner",
      "Copy",
      "Asset",
      "Screenshot",
      "CTA link",
      "Post URL",
      "Project",
      "Evergreen",
      "Notes",
    ],
    posts.map((p) => [
      p.date,
      p.month,
      p.channel,
      p.category ?? "",
      p.topic,
      socialStatusMeta(p.status).label,
      p.owner,
      p.copy,
      p.asset,
      p.screenshot,
      p.ctaLink,
      p.postUrl ?? "",
      p.projectId ? (projectTitle(p.projectId) ?? "Deleted project") : "",
      p.evergreen ? "Yes" : "No",
      p.notes,
    ]),
  );
}

// ── Campaigns calendar ───────────────────────────────────────────────────

export function campaignsInRange(
  campaigns: Campaign[],
  from: string,
  to: string,
): Campaign[] {
  return campaigns
    .filter((c) => campaignOverlaps(c, from, to))
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name),
    );
}

// Milestones inside the range, across every campaign — including those of
// a campaign that runs outside it, since a teaser can go out before launch.
export function milestonesInRange(
  campaigns: Campaign[],
  from: string,
  to: string,
): { campaign: Campaign; milestone: Campaign["milestones"][number] }[] {
  return campaigns
    .flatMap((campaign) =>
      campaign.milestones
        .filter((m) => m.date >= from && m.date <= to)
        .map((milestone) => ({ campaign, milestone })),
    )
    .sort(
      (a, b) =>
        a.milestone.date.localeCompare(b.milestone.date) ||
        a.campaign.name.localeCompare(b.campaign.name),
    );
}

// One row per campaign, its milestones listed in a single cell.
export function campaignsCsv(
  campaigns: Campaign[],
  projectTitle: (id: string) => string | undefined,
): string {
  return toCsv(
    [
      "Campaign",
      "Brand",
      "Type",
      "Owner",
      "Start date",
      "End date",
      "Days",
      "Description",
      "Milestones done",
      "Milestones",
      "Projects",
      "SharePoint page",
    ],
    campaigns.map((c) => {
      const ms = c.milestones
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      return [
        c.name,
        c.brand,
        c.category ?? "",
        c.owner,
        c.startDate,
        c.evergreen ? "Evergreen" : c.endDate,
        c.evergreen ? "" : spanDays(c),
        c.description,
        `${ms.filter((m) => m.done).length} of ${ms.length}`,
        ms
          .map((m) => `${m.date} ${m.label}${m.done ? " (done)" : ""}`)
          .join("\n"),
        (c.projectIds ?? [])
          .map((id) => projectTitle(id) ?? "Deleted project")
          .join("\n"),
        c.sharePointUrl ?? "",
      ];
    }),
  );
}

// One row per milestone, with its campaign alongside.
export function milestonesCsv(
  rows: ReturnType<typeof milestonesInRange>,
): string {
  return toCsv(
    [
      "Date",
      "Milestone",
      "Done",
      "Campaign",
      "Brand",
      "Type",
      "Owner",
      "Campaign start",
      "Campaign end",
    ],
    rows.map(({ campaign: c, milestone: m }) => [
      m.date,
      m.label,
      m.done ? "Yes" : "No",
      c.name,
      c.brand,
      c.category ?? "",
      c.owner,
      c.startDate,
      c.evergreen ? "Evergreen" : c.endDate,
    ]),
  );
}

// ── Events ───────────────────────────────────────────────────────────────

// Events touching the range: dated ones by their run, month-only ones by
// their month. Events with no date at all belong to no stretch of the
// calendar, so they never come along.
export function eventsInRange(
  events: MarketingEvent[],
  from: string,
  to: string,
): MarketingEvent[] {
  return events
    .filter((e) => eventOverlaps(e, from, to))
    .sort(
      (a, b) =>
        eventSortKey(a).localeCompare(eventSortKey(b)) || a.name.localeCompare(b.name),
    );
}

// One row per event, the way the portal lays its sheets out: dates and
// place first, then who, then money, then results, then the checklist.
export function eventsCsv(events: MarketingEvent[], today: string): string {
  const yesNo = (v: boolean | undefined) => (v === undefined ? "" : v ? "Yes" : "No");
  return toCsv(
    [
      "Event",
      "Status",
      "Start date",
      "End date",
      "Dates TBC",
      "Dates as published",
      "Financial year",
      "Division",
      "Region",
      "Location",
      "Audience",
      "Sponsor",
      "Sponsor note",
      "Booth",
      "Booth note",
      "Attend & sell",
      "Speaking opportunity",
      "Marketing lead",
      "Sales lead",
      "Sales attendees (n)",
      "Sales attendees",
      "WiseTech Academy attendee",
      "Partner attendees",
      "Campaign code",
      "Investment",
      "Currency",
      "Investment (USD)",
      "Cost details",
      "Comms",
      "Opps",
      "Opps breakdown",
      "Presentation",
      "Feedback",
      "Checklist done",
      ...EVENT_CHECKLIST.map((item) => item.label),
      "Needs follow-up",
      "Notes",
    ],
    events.map((e) => [
      e.name,
      eventStatusMeta(eventPhase(e, today)).label,
      e.startDate,
      e.endDate,
      e.startDate ? "" : e.tbcMonth ? `${e.tbcMonth} (month only)` : String(e.year),
      e.datesAsPublished ?? "",
      fiscalYear(e.startDate || (e.tbcMonth ? `${e.tbcMonth}-01` : "")),
      e.division,
      e.region ?? "",
      e.location ?? "",
      e.audience ?? "",
      yesNo(e.sponsor),
      e.sponsorNote ?? "",
      yesNo(e.booth),
      e.boothNote ?? "",
      yesNo(e.attendAndSell),
      e.speakingOpportunity ?? "",
      e.marketingLead ?? "",
      e.salesLead ?? "",
      e.salesAttendeeCount,
      e.salesAttendees ?? "",
      e.academyAttendee ?? "",
      e.partnerAttendees ?? "",
      e.campaignCode ?? "",
      e.investment,
      e.investment === undefined ? "" : (e.currency ?? "USD"),
      e.investmentUsd,
      e.costDetails ?? "",
      e.comms,
      e.opps,
      e.oppsBreakdown ?? "",
      e.presentation ?? "",
      e.feedbackDoc ?? "",
      `${checklistDone(e)} of ${EVENT_CHECKLIST.length}`,
      ...EVENT_CHECKLIST.map((item) => (e.checklist?.[item.key] ? "Yes" : "No")),
      followUpMissing(e, today).join(", "),
      e.notes ?? "",
    ]),
  );
}

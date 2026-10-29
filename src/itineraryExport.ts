import type { EventItinerary, MarketingEvent } from "./types";
import template from "./itineraryPage.template.html?raw";
import { firebaseConfig } from "./firebase";
import { setItineraryPage } from "./firestore";
import { ITINERARY_FOOTER, TRAVEL_STATEMENT, sortItems } from "./itinerary";

// An event's attendee itinerary as a standalone page for SharePoint, built
// the same way as a campaign's page (see campaignExport.ts): downloaded as
// .aspx so SharePoint renders it, with a snapshot baked in and a public
// copy at /itineraryPages/{token} that the page fetches every time it's
// opened, so the copy on SharePoint keeps up with Waypoint.
//
// Like the campaign page, the file stands alone and nothing in the template
// names Waypoint. Its __ITINERARY_*__ markers are filled in below.

function itineraryPageUrl(shareToken: string): string {
  const { projectId, apiKey } = firebaseConfig;
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)` +
    `/documents/itineraryPages/${shareToken}?key=${apiKey}`
  );
}

// The page's additions collection, listed and added to by readers through
// the same REST API. The rules take a create from anyone with the token.
function itineraryAdditionsUrl(shareToken: string): string {
  const { projectId, apiKey } = firebaseConfig;
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)` +
    `/documents/itineraryPages/${shareToken}/additions?key=${apiKey}`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rows(list: EventItinerary["venue"]) {
  return list
    .filter((r) => r.label.trim() || r.value.trim() || r.note.trim())
    .map((r) => ({ label: r.label, value: r.value, note: r.note }));
}

// What the page shows, for the snapshot and the public copy alike. An
// explicit list: the event's spend, results and checklist stay out.
export function itineraryPageData(event: MarketingEvent, itinerary: EventItinerary) {
  return {
    name: event.name,
    headerLine: itinerary.headerLine,
    startDate: event.startDate,
    endDate: event.endDate,
    location: event.location ?? "",
    cities: itinerary.cities.map((c) => ({ name: c.name, color: c.color })),
    attendees: rows(itinerary.attendees),
    attendeesNote: itinerary.attendeesNote,
    venue: rows(itinerary.venue),
    contacts: rows(itinerary.contacts),
    standShifts: rows(itinerary.standShifts),
    shipping: rows(itinerary.shipping),
    days: itinerary.days
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        city: d.city,
        title: d.title,
        note: d.note,
        items: sortItems(d.items).map((i) => ({
          start: i.start,
          end: i.end,
          type: i.type,
          title: i.title,
          details: i.details,
          attending: i.attending,
          also: i.also,
        })),
      })),
    travel: TRAVEL_STATEMENT,
    footer: ITINERARY_FOOTER,
    updatedAt: new Date().toISOString(),
  };
}

// Refresh a shared itinerary's public copy. An event without a token (or
// without an itinerary) has no page, so nothing is written.
export function publishItineraryPage(event: MarketingEvent): Promise<void> {
  if (!event.itineraryShareToken || !event.itinerary) return Promise.resolve();
  return setItineraryPage(
    event.itineraryShareToken,
    JSON.stringify(itineraryPageData(event, event.itinerary)),
  );
}

export function itineraryPageHtml(
  event: MarketingEvent,
  itinerary: EventItinerary,
  shareToken: string,
): string {
  const snapshot = JSON.stringify(itineraryPageData(event, itinerary)).replace(/</g, "\\u003c");
  const fill: Record<string, string> = {
    __ITINERARY_TITLE__: escapeHtml(`${event.name} · Itinerary`),
    __ITINERARY_SNAPSHOT__: snapshot,
    __ITINERARY_FEED_URL__: itineraryPageUrl(shareToken),
    __ITINERARY_ADDITIONS_URL__: itineraryAdditionsUrl(shareToken),
  };
  return template.replace(/__ITINERARY_[A-Z_]+__/g, (key) => fill[key] ?? key);
}

export function itineraryPageFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "event"}-itinerary.aspx`;
}

export function downloadItineraryPage(
  event: MarketingEvent,
  itinerary: EventItinerary,
  shareToken: string,
): void {
  const blob = new Blob([itineraryPageHtml(event, itinerary, shareToken)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = itineraryPageFileName(event.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

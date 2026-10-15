import type { Campaign } from "./types";
import template from "./campaignPage.template.html?raw";

// A campaign as a standalone page for SharePoint: downloaded as .aspx, which
// SharePoint renders as a page where it would only offer an .html file for
// download. The page shows a snapshot taken at download and then fetches
// the campaign from the campaignSummary Cloud Function (functions/src) every
// time it's opened, so the copy on SharePoint keeps up with Waypoint without
// anyone re-uploading it.
//
// SharePoint viewers aren't signed in to Waypoint, so the page can't read
// Firestore itself. It's keyed by the campaign's shareToken instead.
//
// The page is meant to stand alone, so nothing in the template names
// Waypoint — keep it that way, comments included, since they ship in the
// downloaded file. Its __CAMPAIGN_*__ markers are filled in below.

// The deployed campaignSummary function. us-central1 like the others in
// functions/src/index.ts.
export const CAMPAIGN_FEED_URL =
  "https://us-central1-wtg-waypoint.cloudfunctions.net/campaignSummary";

// 32 hex characters, matching SHARE_TOKEN_PATTERN in the function.
// getRandomValues rather than randomUUID, which only exists in a secure
// context.
export function newShareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The same fields the function returns, so the page draws the snapshot and
// the live copy through one path. Contributing projects stay out of both.
function snapshotOf(c: Campaign) {
  return {
    name: c.name,
    brand: c.brand,
    category: c.category ?? "",
    owner: c.owner,
    description: c.description,
    startDate: c.startDate,
    endDate: c.endDate,
    color: c.color,
    evergreen: !!c.evergreen,
    milestones: c.milestones.map(({ id, date, label, done }) => ({
      id,
      date,
      label,
      done,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

export function campaignPageHtml(campaign: Campaign, shareToken: string): string {
  // Inside <script type="application/json"> the only thing that can break
  // out is a closing tag, so every "<" is escaped as <.
  const snapshot = JSON.stringify(snapshotOf(campaign)).replace(/</g, "\\u003c");
  const fill: Record<string, string> = {
    __CAMPAIGN_TITLE__: escapeHtml(`${campaign.name} · Campaign`),
    __CAMPAIGN_SNAPSHOT__: snapshot,
    __CAMPAIGN_FEED_URL__: CAMPAIGN_FEED_URL,
    __CAMPAIGN_TOKEN__: shareToken,
  };
  // A function replacer, so a "$" in the campaign's text isn't read as a
  // replacement pattern.
  return template.replace(/__CAMPAIGN_[A-Z_]+__/g, (key) => fill[key] ?? key);
}

export function campaignPageFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "campaign"}.aspx`;
}

export function downloadCampaignPage(campaign: Campaign, shareToken: string): void {
  const blob = new Blob([campaignPageHtml(campaign, shareToken)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = campaignPageFileName(campaign.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

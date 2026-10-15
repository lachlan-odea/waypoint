import type { Campaign } from "./types";
import template from "./campaignPage.template.html?raw";
import { firebaseConfig } from "./firebase";
import { setCampaignPage } from "./firestore";

// A campaign as a standalone page for SharePoint: downloaded as .aspx, which
// SharePoint renders as a page where it would only offer an .html file for
// download, then fetches the campaign again every time it's opened, so the
// copy on SharePoint keeps up with Waypoint without anyone re-uploading it.
//
// SharePoint viewers aren't signed in to Waypoint, so the page can't read
// /campaigns. Instead every save of a shared campaign also writes a public
// copy of the fields the page shows to /campaignPages/{shareToken}
// (publishCampaignPage, called from App.saveCampaign), which the rules let
// anyone read by exact token, and the page fetches that through Firestore's
// REST API. No server of our own is involved.
//
// The page is meant to stand alone, so nothing in the template names
// Waypoint — keep it that way, comments included, since they ship in the
// downloaded file. Its __CAMPAIGN_*__ markers are filled in below.

// Where the page reads its campaign: one document over Firestore's REST
// API. The web API key is a public project identifier (see firebase.ts);
// access is the rules' job.
function campaignPageUrl(shareToken: string): string {
  const { projectId, apiKey } = firebaseConfig;
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)` +
    `/documents/campaignPages/${shareToken}?key=${apiKey}`
  );
}

// 32 hex characters, matching the campaignPages rule in firestore.rules.
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

// What the page shows, for the snapshot baked into the file and the public
// copy alike, so it draws both through one path. An explicit list, so
// contributing projects (and anything added to campaigns later) stay out.
function campaignPageData(c: Campaign) {
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
    updatedAt: new Date().toISOString(),
  };
}

// Refresh a shared campaign's public copy. A campaign without a token has
// no page, so nothing is written for it.
export function publishCampaignPage(c: Campaign): Promise<void> {
  if (!c.shareToken) return Promise.resolve();
  return setCampaignPage(c.shareToken, JSON.stringify(campaignPageData(c)));
}

export function campaignPageHtml(campaign: Campaign, shareToken: string): string {
  // Inside <script type="application/json"> the only thing that can break
  // out is a closing tag, so every "<" is escaped as <.
  const snapshot = JSON.stringify(campaignPageData(campaign)).replace(/</g, "\\u003c");
  const fill: Record<string, string> = {
    __CAMPAIGN_TITLE__: escapeHtml(`${campaign.name} · Campaign`),
    __CAMPAIGN_SNAPSHOT__: snapshot,
    __CAMPAIGN_FEED_URL__: campaignPageUrl(shareToken),
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

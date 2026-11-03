import template from "./liveEventRequestForm.template.html?raw";
import { firebaseConfig } from "./firebase";
import { newShareToken } from "./campaignExport";
import { FACILITIES_EMAIL, LIVE_EVENTS_TEAM_EMAIL } from "./constants";
import type { LiveEventIntake } from "./types";

// The Live event request form as a standalone page for SharePoint, built
// like the itinerary and campaign pages (see itineraryExport.ts):
// downloaded as .aspx so SharePoint renders it, with nothing in it that
// names Waypoint. Unlike those pages it shows nothing from Firestore; it
// only writes, one document per request, to /liveEventRequests through
// the REST API, carrying the intake token baked in here. The rules accept
// a create only while that token is the one in /settings/liveEventIntake,
// so rotating the token retires every copy of the form already out there.

export const LIVE_EVENT_FORM_FILE_NAME = "live-event-request.aspx";

export function newIntakeToken(): string {
  return newShareToken();
}

function submitUrl(): string {
  const { projectId, apiKey } = firebaseConfig;
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)` +
    `/documents/liveEventRequests?key=${apiKey}`
  );
}

// The mailboxes the form names: the team's own unless Settings says
// otherwise.
export function intakeEmails(intake: LiveEventIntake): { teamEmail: string; facilitiesEmail: string } {
  return {
    teamEmail: intake.teamEmail?.trim() || LIVE_EVENTS_TEAM_EMAIL,
    facilitiesEmail: intake.facilitiesEmail?.trim() || FACILITIES_EMAIL,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A value as a JavaScript literal safe inside the page's <script>: `<` is
// escaped so a stray "</script>" in a setting can't end it early.
function jsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function liveEventFormHtml(intake: LiveEventIntake, token: string): string {
  const { teamEmail, facilitiesEmail } = intakeEmails(intake);
  const fill: Record<string, string> = {
    __LER_TITLE__: escapeHtml("Live Event Request"),
    __LER_SUBMIT_URL__: jsLiteral(submitUrl()),
    __LER_TOKEN__: jsLiteral(token),
    __LER_TEAM_EMAIL__: jsLiteral(teamEmail),
    __LER_FACILITIES_EMAIL__: jsLiteral(facilitiesEmail),
    __LER_LINKS__: jsLiteral({
      runsheetBlank: intake.runsheetBlankUrl?.trim() ?? "",
      runsheetExample: intake.runsheetExampleUrl?.trim() ?? "",
      guideObs: intake.guideObsUrl?.trim() ?? "",
      guidePhone: intake.guidePhoneUrl?.trim() ?? "",
    }),
  };
  return template.replace(/__LER_[A-Z_]+__/g, (key) => fill[key] ?? key);
}

export function downloadLiveEventForm(intake: LiveEventIntake, token: string): void {
  const blob = new Blob([liveEventFormHtml(intake, token)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = LIVE_EVENT_FORM_FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

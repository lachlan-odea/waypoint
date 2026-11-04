// The one layout every Waypoint email uses, in the Waypoint design system:
// the app icon and wordmark, a heading in WiseTech blue, a line on what
// happened, the reasons as a list when there are several, the facts in a
// table, an optional paragraph (the project's overview, the campaign's
// description), an optional short list (next milestones, your sections),
// links, and a cobalt button to the thing itself.
//
// Everything is inline styles on tables, which is what Outlook needs; the
// web font DM Sans can't load in mail, so Segoe UI / Arial stand in. Keep
// the colours in step with the --wtg-* tokens in src/App.css.

const BLUE = "#1D1765";
const COBALT = "#371EE1";
const NAVY = "#141E30";
const SKY = "#A7CFF8";
const PERIWINKLE = "#B7B3FF";
const MUTED = "#5B6478";
const BORDER = "#E3E6F0";
const PAGE = "#F3F4FA";
const FONT = `"DM Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

// Hosted with the app; a PNG because Outlook won't render SVG.
const APP_ICON_URL = "https://lachlan-odea.github.io/waypoint/app-icon.png";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailRow = [label: string, value: string];
export type EmailLink = { label: string; url: string };

export type EmailContent = {
  // A small line above the heading: "Project", "Webinar", "Event".
  kicker: string;
  heading: string;
  // Who did what, in a sentence. Rendered after "Hi <first name>,".
  intro: string;
  // Shown as a list under the intro when there is more than one.
  reasons?: string[];
  rows: EmailRow[];
  // A paragraph of the thing's own words: overview, description, notes.
  about?: { title: string; text: string };
  // A short list: the next milestones, the sections you own.
  list?: { title: string; items: string[] };
  links?: EmailLink[];
  ctaLabel: string;
  ctaUrl: string;
};

// "Alice and Bob", "Alice, Bob and Carol".
export function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Long free text, cut at a word with an ellipsis.
export function clip(text: string, max = 360): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40))}…`;
}

function section(title: string, body: string): string {
  return `<tr><td style="padding: 18px 0 0;">
    <div style="font-family: ${FONT}; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${MUTED}; margin: 0 0 8px;">${escapeHtml(title)}</div>
    ${body}
  </td></tr>`;
}

export function renderEmail(firstName: string, c: EmailContent): string {
  const rows = c.rows.filter(([, v]) => v.trim() !== "");
  const reasons = c.reasons ?? [];
  const links = (c.links ?? []).filter((l) => l.url.trim() !== "");

  const reasonList =
    reasons.length <= 1
      ? ""
      : `<ul style="margin: 8px 0 0 20px; padding: 0; font-family: ${FONT}; font-size: 15px; line-height: 1.5; color: ${NAVY};">${reasons
          .map((r) => `<li style="margin: 2px 0;">${escapeHtml(r)}</li>`)
          .join("")}</ul>`;

  const facts =
    rows.length === 0
      ? ""
      : section(
          "Details",
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; width: 100%;">${rows
            .map(
              ([k, v], i) =>
                `<tr>
                  <td style="padding: 7px 14px 7px 0; font-family: ${FONT}; font-size: 14px; color: ${MUTED}; vertical-align: top; white-space: nowrap; width: 128px; ${i === 0 ? "" : `border-top: 1px solid ${BORDER};`}">${escapeHtml(k)}</td>
                  <td style="padding: 7px 0; font-family: ${FONT}; font-size: 14px; color: ${NAVY}; vertical-align: top; ${i === 0 ? "" : `border-top: 1px solid ${BORDER};`}">${escapeHtml(v)}</td>
                </tr>`,
            )
            .join("")}</table>`,
        );

  const about =
    c.about && c.about.text.trim()
      ? section(
          c.about.title,
          `<div style="border-left: 3px solid ${PERIWINKLE}; padding: 2px 0 2px 14px; font-family: ${FONT}; font-size: 14px; line-height: 1.55; color: ${NAVY};">${escapeHtml(clip(c.about.text))}</div>`,
        )
      : "";

  const list =
    c.list && c.list.items.length > 0
      ? section(
          c.list.title,
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">${c.list.items
            .map(
              (item) =>
                `<tr><td style="padding: 3px 10px 3px 0; color: ${COBALT}; font-family: ${FONT}; font-size: 14px; vertical-align: top;">&bull;</td><td style="padding: 3px 0; font-family: ${FONT}; font-size: 14px; line-height: 1.5; color: ${NAVY};">${escapeHtml(item)}</td></tr>`,
            )
            .join("")}</table>`,
        )
      : "";

  const linkRow =
    links.length === 0
      ? ""
      : section(
          "Links",
          `<div style="font-family: ${FONT}; font-size: 14px; line-height: 1.8;">${links
            .map(
              (l) =>
                `<a href="${escapeHtml(l.url)}" style="color: ${COBALT}; text-decoration: underline;">${escapeHtml(l.label)}</a>`,
            )
            .join("<br>")}</div>`,
        );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(c.heading)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${PAGE};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: ${PAGE}; border-collapse: collapse;">
<tr><td align="center" style="padding: 28px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; width: 100%; background: #FFFFFF; border: 1px solid ${BORDER}; border-top: 4px solid ${COBALT}; border-radius: 12px; border-collapse: separate;">
    <tr><td style="padding: 22px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding-right: 10px; vertical-align: middle;"><img src="${APP_ICON_URL}" width="32" height="32" alt="" style="display: block; width: 32px; height: 32px; border-radius: 8px;"></td>
          <td style="vertical-align: middle; font-family: ${FONT}; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; color: ${BLUE};">Waypoint</td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding: 18px 28px 0;">
      <div style="font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${COBALT}; margin: 0 0 6px;">${escapeHtml(c.kicker)}</div>
      <h1 style="margin: 0; font-family: ${FONT}; font-size: 22px; line-height: 1.25; font-weight: 700; letter-spacing: -0.01em; color: ${BLUE};">${escapeHtml(c.heading)}</h1>
    </td></tr>
    <tr><td style="padding: 14px 28px 0;">
      <p style="margin: 0; font-family: ${FONT}; font-size: 15px; line-height: 1.5; color: ${NAVY};">Hi ${escapeHtml(firstName)}, ${escapeHtml(c.intro)}</p>
      ${reasonList}
    </td></tr>
    <tr><td style="padding: 0 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
        ${facts}
        ${about}
        ${list}
        ${linkRow}
      </table>
    </td></tr>
    <tr><td style="padding: 24px 28px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr><td style="background: ${COBALT}; border-radius: 8px;">
          <a href="${escapeHtml(c.ctaUrl)}" style="display: inline-block; padding: 11px 20px; font-family: ${FONT}; font-size: 14px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 8px;">${escapeHtml(c.ctaLabel)}</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding: 0 28px 22px;">
      <div style="border-top: 1px solid ${SKY}; padding-top: 14px; font-family: ${FONT}; font-size: 12px; line-height: 1.5; color: ${MUTED};">
        Sent by Waypoint, the creative teams' project tool. You can turn these emails off from My Desk &rarr; Notifications &rarr; Email alerts.
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

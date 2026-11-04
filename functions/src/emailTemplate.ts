// The one layout every Waypoint email uses: a heading, a line on what
// happened, the reasons as a list when there are several, a few facts in
// a table, and a button to the thing itself.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailRow = [label: string, value: string];

export type EmailContent = {
  heading: string;
  // Who did what, in a sentence. Rendered after "Hi <first name>,".
  intro: string;
  // Shown as a list under the intro when there is more than one.
  reasons?: string[];
  rows: EmailRow[];
  ctaLabel: string;
  ctaUrl: string;
};

// "Alice and Bob", "Alice, Bob and Carol".
export function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function renderEmail(firstName: string, c: EmailContent): string {
  const rows = c.rows.filter(([, v]) => v.trim() !== "");
  const reasons = c.reasons ?? [];
  const reasonList =
    reasons.length <= 1
      ? ""
      : `<ul style="margin: 8px 0 8px 20px; padding: 0; color: #475569;">${reasons
          .map((r) => `<li style="margin: 2px 0;">${escapeHtml(r)}</li>`)
          .join("")}</ul>`;
  const table =
    rows.length === 0
      ? ""
      : `<table style="border-collapse: collapse; font-size: 14px; margin: 16px 0;">${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding: 4px 12px 4px 0; color: #64748b; vertical-align: top;">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
          )
          .join("")}</table>`;
  return [
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 540px; color: #1d2433;">`,
    `<h2 style="font-size: 18px; margin: 0 0 8px;">${escapeHtml(c.heading)}</h2>`,
    `<p style="margin: 8px 0; color: #475569;">Hi ${escapeHtml(firstName)}, ${escapeHtml(c.intro)}</p>`,
    reasonList,
    table,
    `<a href="${c.ctaUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600;">${escapeHtml(c.ctaLabel)}</a>`,
    `<p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8;">Sent by Waypoint. Turn these emails off from My Desk &rarr; Notifications.</p>`,
    `</div>`,
  ].join("");
}

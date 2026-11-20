// The pure half of the Basecamp connector (basecamp.ts): turning a Waypoint
// project into what Basecamp should hold, and Basecamp's rich-text
// description to and from Waypoint's plain overview. No Firebase and no
// network in here, so it can be reasoned about (and tested) on its own.

// What Waypoint wants a project's Basecamp copy to say.
export type Desired = {
  name: string;
  // Plain text, the project's overview.
  description: string;
  archived: boolean;
  // ISO date (YYYY-MM-DD), or "" when the project has no due date.
  endDate: string;
  // The ids of the designers assigned to it, sorted and comma-joined, so a
  // change of assignees reads as a change to send.
  assignees: string;
};

type ProjectLike = {
  title?: unknown;
  overview?: unknown;
  status?: unknown;
  archived?: unknown;
  dueDate?: unknown;
  assigneeIds?: unknown;
};

export function assigneeIdsOf(p: ProjectLike): string[] {
  return Array.isArray(p.assigneeIds) ? p.assigneeIds.map(String).filter(Boolean) : [];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Work that's finished or stopped in Waypoint is archived in Basecamp;
// everything else is active there. Keep the statuses in step with
// ProjectStatus in src/types.ts.
const CLOSED_STATUSES = ["completed", "cancelled"];

export function normaliseText(s: unknown): string {
  return String(s ?? "").replace(/\r\n?/g, "\n").trim();
}

export function desiredFor(p: ProjectLike): Desired {
  const due = String(p.dueDate ?? "").trim();
  return {
    name: normaliseText(p.title).replace(/\s+/g, " ") || "Untitled project",
    description: normaliseText(p.overview),
    archived: p.archived === true || CLOSED_STATUSES.includes(String(p.status ?? "")),
    endDate: ISO_DATE.test(due) ? due : "",
    assignees: assigneeIdsOf(p).sort().join(","),
  };
}

export function sameDesired(a: Desired, b: Desired | undefined): boolean {
  return (
    !!b &&
    a.name === b.name &&
    a.description === b.description &&
    a.archived === b.archived &&
    a.endDate === b.endDate &&
    a.assignees === b.assignees
  );
}

// Basecamp wants a start date whenever it's given an end date. The project's
// creation day is used, unless it was created after it falls due.
export function scheduleFor(endDate: string, createdAt: unknown): { start_date: string; end_date: string } | null {
  if (!endDate) return null;
  const created = String(createdAt ?? "").slice(0, 10);
  const start = ISO_DATE.test(created) && created <= endDate ? created : endDate;
  return { start_date: start, end_date: endDate };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Plain text as the rich text Basecamp's editor writes: one block, line
// breaks as <br>.
export function textToHtml(text: string): string {
  const t = normaliseText(text);
  if (!t) return "";
  return `<div>${t.split("\n").map(escapeHtml).join("<br>")}</div>`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// Basecamp's rich text as plain text: blocks and <br> become line breaks,
// list items get a dash, every other tag is dropped.
export function htmlToText(html: unknown): string {
  const s = String(html ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(div|p|li|h[1-6]|blockquote|pre|tr)>\n?/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(s)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

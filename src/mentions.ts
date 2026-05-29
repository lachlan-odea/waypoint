import type { Designer } from "./types";

// `@FirstName` mentions. The leading lookbehind keeps us from matching after
// word chars (so emails like `me@cargowise` don't read as `@cargowise`).
export const MENTION_RE = /(?<!\w)@([A-Za-z]+)/g;

function firstName(d: Designer): string {
  return d.name.split(" ")[0];
}

export function resolveMention(
  name: string,
  designers: Designer[],
): Designer | null {
  const key = name.toLowerCase();
  return designers.find((d) => firstName(d).toLowerCase() === key) ?? null;
}

export function findMentionedDesigners(
  text: string,
  designers: Designer[],
): Designer[] {
  const found = new Map<string, Designer>();
  for (const m of text.matchAll(MENTION_RE)) {
    const d = resolveMention(m[1], designers);
    if (d) found.set(d.id, d);
  }
  return [...found.values()];
}

// Designers mentioned in `next` but not in `prev` — used when editing a
// comment so we only notify newly-added mentions.
export function findNewMentions(
  prev: string,
  next: string,
  designers: Designer[],
): Designer[] {
  const before = new Set(findMentionedDesigners(prev, designers).map((d) => d.id));
  return findMentionedDesigners(next, designers).filter((d) => !before.has(d.id));
}

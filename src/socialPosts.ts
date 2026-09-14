import type { SocialPost } from "./types";

// A post's headline. Most have a topic; the few that don't fall back to the
// opening line of the copy rather than rendering an empty card. Lives here
// rather than in SocialPostCard so component files only export components
// (Fast Refresh needs that) and the calendar can sort by it without
// importing a component.
export function socialPostTitle(post: SocialPost): string {
  if (post.topic.trim()) return post.topic.trim();
  const firstLine = post.copy
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine ?? "Untitled post";
}

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

// The text handed to LinkedIn: the copy, plus the CTA link on its own line
// when the copy doesn't already contain it, so LinkedIn picks it up for the
// link preview.
export function linkedInPostText(
  post: Pick<SocialPost, "copy" | "ctaLink">,
): string {
  const copy = post.copy.trim();
  const cta = post.ctaLink.trim();
  if (isHttpUrl(cta) && !copy.includes(cta)) return `${copy}\n\n${cta}`;
  return copy;
}

// LinkedIn's feed with the composer open and the text pre-filled. Posting to
// a company page through LinkedIn's API needs an approved developer app and
// a backend to hold the token, which we don't have, so we hand off to the
// composer instead: the poster picks the CargoWise / WiseTech page as the
// author, attaches the asset and clicks Post. This URL isn't a documented
// API — it's the one LinkedIn's own share buttons produce and it has been
// stable for years — so callers also put the text on the clipboard in case
// the composer comes up empty.
export function linkedInComposeUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}

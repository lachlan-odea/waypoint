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

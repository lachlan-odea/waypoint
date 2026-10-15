import type { CampaignMilestone, SocialPost } from "../types";
import { socialStatusMeta } from "../constants";

type Props = {
  milestone: CampaignMilestone;
  socialPosts: SocialPost[];
  onOpen: (postId: string) => void;
};

// The way from a social milestone to the post it put on the Social
// calendar, with the post's status so the campaign shows at a glance which
// posts are still drafts. Renders nothing for a milestone without a post.
export function MilestonePostLink({ milestone, socialPosts, onOpen }: Props) {
  const id = milestone.socialPostId;
  if (!id) return null;
  const post = socialPosts.find((p) => p.id === id);
  // An empty list is most likely still loading, so don't call the post
  // deleted on the strength of it.
  if (!post && socialPosts.length > 0) {
    return (
      <span className="camp-ms-post dangling" title="The social post has been deleted">
        Post deleted
      </span>
    );
  }
  return (
    <button
      type="button"
      className="camp-ms-post"
      onClick={() => onOpen(id)}
      title="Open the social post on the Social calendar"
    >
      Social post{post ? ` · ${socialStatusMeta(post.status).label}` : ""} ↗
    </button>
  );
}

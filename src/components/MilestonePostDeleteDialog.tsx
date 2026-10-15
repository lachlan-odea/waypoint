import { useEffect } from "react";
import type { CampaignMilestone, SocialPost } from "../types";
import { socialStatusMeta } from "../constants";
import { formatShort } from "../dates";

type Props = {
  milestone: CampaignMilestone;
  post: SocialPost;
  // Remove the milestone and delete its post as well.
  onDeletePost: () => void;
  // Remove the milestone, leave the post on the Social calendar.
  onKeepPost: () => void;
  // Leave the milestone where it is.
  onCancel: () => void;
};

// Asked when a milestone that created a Social calendar post is removed
// from a campaign, since the post might be wanted on its own (or already
// out of the door) — or might be a stray draft nobody will clean up.
export function MilestonePostDeleteDialog({
  milestone,
  post,
  onDeletePost,
  onKeepPost,
  onCancel,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const status = socialStatusMeta(post.status);
  const published = post.status === "published";

  return (
    <div className="modal-overlay confirm-overlay">
      <div
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ms-post-delete-title"
        aria-describedby="ms-post-delete-body"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 className="modal-title-static" id="ms-post-delete-title">
            Delete the social post too?
          </h2>
        </header>
        <div className="modal-body" id="ms-post-delete-body">
          <p style={{ margin: 0 }}>
            The <strong>{milestone.label}</strong> milestone you're removing has
            a post on the Social calendar:
          </p>
          <p className="confirm-post">
            <strong>{post.topic || "Untitled post"}</strong>
            <span className="muted small">
              {post.date ? formatShort(post.date) : "Unscheduled"} · {post.channel || "No channel"} ·{" "}
              {status.label}
            </span>
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            {published
              ? "It's already been published. Deleting it only removes it from the calendar, not from LinkedIn. "
              : ""}
            Nothing changes until you save the campaign.
          </p>
        </div>
        <footer className="modal-foot">
          <button style={{ marginRight: "auto" }} onClick={onCancel}>
            Cancel
          </button>
          <button onClick={onKeepPost} autoFocus>
            Keep the post
          </button>
          <button className="danger" onClick={onDeletePost}>
            Delete the post too
          </button>
        </footer>
      </div>
    </div>
  );
}

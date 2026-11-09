import { useState } from "react";
import type { CampaignMilestone, MilestoneType, SocialPost } from "../types";
import { isSocialMilestone, newMilestoneId } from "../campaigns";
import { shiftIso } from "../dates";
import { MilestonePostLink } from "./MilestonePostLink";
import { MilestonePostDeleteDialog } from "./MilestonePostDeleteDialog";

type Props = {
  milestones: CampaignMilestone[];
  onChange: (milestones: CampaignMilestone[]) => void;
  // The milestone type picker's options (Settings → Types & tags).
  milestoneTypes: MilestoneType[];
  // The campaign's dates, for the "falls outside" warning and the date a
  // first milestone defaults to. An evergreen campaign has no end.
  startDate: string;
  endDate: string;
  evergreen?: boolean;
  // For the link from each social milestone to the post it created, and
  // the "delete the post too?" question when such a milestone is removed.
  socialPosts?: SocialPost[];
  onOpenSocialPost?: (postId: string) => void;
  // Called when the person chooses to delete a removed milestone's post as
  // well. The caller holds the ids until its save, so cancelling the editor
  // leaves the post alone.
  onDeletePost?: (postId: string) => void;
  // Told when the "delete the post too?" prompt opens and closes, so a
  // window around the editor can leave Escape to the prompt meanwhile.
  onPrompting?: (open: boolean) => void;
};

// The list of milestone rows shared by the campaign editor (Details tab and
// the New campaign window) and the Milestones tab's edit mode. Controlled:
// the caller owns the list and saves it.
export function CampaignMilestonesEditor({
  milestones,
  onChange,
  milestoneTypes,
  startDate,
  endDate,
  evergreen = false,
  socialPosts,
  onOpenSocialPost,
  onDeletePost,
  onPrompting,
}: Props) {
  // A milestone with a social post, waiting on "delete the post too?".
  const [removing, setRemovingState] = useState<CampaignMilestone | null>(null);
  function setRemoving(m: CampaignMilestone | null) {
    setRemovingState(m);
    onPrompting?.(!!m);
  }

  function patch(id: string, p: Partial<CampaignMilestone>) {
    onChange(milestones.map((m) => (m.id === id ? { ...m, ...p } : m)));
  }

  function add() {
    // Default to the day after the last milestone, or the start date, so a
    // run of "EDM 1 / EDM 2 / EDM 3" needs a label each and little else.
    const last = milestones[milestones.length - 1];
    const date = last?.date ? shiftIso(last.date, 1) : startDate;
    onChange([...milestones, { id: newMilestoneId(), date, label: "", done: false }]);
  }

  // A milestone whose post still exists asks about the post first. One
  // whose post is already gone (or never existed) just goes.
  function remove(id: string) {
    const m = milestones.find((x) => x.id === id);
    const postId = m?.socialPostId;
    if (m && postId && socialPosts?.some((p) => p.id === postId)) {
      setRemoving(m);
      return;
    }
    drop(id);
  }

  function drop(id: string) {
    onChange(milestones.filter((m) => m.id !== id));
  }

  function confirmRemoval(deletePost: boolean) {
    if (!removing) return;
    const postId = removing.socialPostId;
    if (deletePost && postId) onDeletePost?.(postId);
    drop(removing.id);
    setRemoving(null);
  }

  // A milestone can fall before any campaign's start, and after a dated
  // one's end; an evergreen campaign has no end to fall after.
  const isOutside = (m: CampaignMilestone) =>
    !!m.date && (m.date < startDate || (!evergreen && m.date > endDate));
  const outside = milestones.filter(isOutside).length;

  const removingPost = removing ? socialPosts?.find((p) => p.id === removing.socialPostId) : undefined;

  return (
    <>
      {milestones.length === 0 ? (
        <p className="muted small">No milestones yet.</p>
      ) : (
        <div className="camp-ms-list">
          {milestones.map((m) => (
            <div key={m.id} className={`camp-ms-row ${isOutside(m) ? "outside" : ""}`}>
              <label className="camp-ms-done" title="Done">
                <input
                  type="checkbox"
                  checked={m.done}
                  onChange={(e) => patch(m.id, { done: e.target.checked })}
                />
              </label>
              <input
                type="date"
                value={m.date}
                onChange={(e) => patch(m.id, { date: e.target.value })}
              />
              <select
                value={m.label}
                onChange={(e) => patch(m.id, { label: e.target.value })}
                aria-label="Milestone type"
              >
                <option value="" disabled>
                  Choose a type…
                </option>
                {milestoneTypes.map((t) => (
                  <option key={t.id} value={t.label}>
                    {t.label}
                  </option>
                ))}
                {/* A milestone whose type predates the list, or was since
                    renamed or removed, keeps its own text. */}
                {m.label && !milestoneTypes.some((t) => t.label === m.label) && (
                  <option value={m.label}>{m.label}</option>
                )}
              </select>
              {m.socialPostId ? (
                onOpenSocialPost && (
                  <MilestonePostLink milestone={m} socialPosts={socialPosts ?? []} onOpen={onOpenSocialPost} />
                )
              ) : isSocialMilestone(m, milestoneTypes) ? (
                <span className="field-hint camp-ms-post-hint">Creates a draft social post on save</span>
              ) : (
                // Social milestones link to their post; the rest can carry a
                // link to their asset for the SharePoint page.
                <input
                  type="url"
                  className="camp-ms-url"
                  value={m.url ?? ""}
                  placeholder="Link (optional)"
                  aria-label={`Link for ${m.label || "this milestone"}`}
                  onChange={(e) => patch(m.id, { url: e.target.value })}
                />
              )}
              <button type="button" className="link-btn" onClick={() => remove(m.id)}>
                Remove
              </button>
              <input
                className="camp-ms-desc"
                value={m.description ?? ""}
                maxLength={200}
                placeholder="Short description (optional)"
                aria-label={`Description for ${m.label || "this milestone"}`}
                onChange={(e) => patch(m.id, { description: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
      {outside > 0 && (
        <p className="field-hint warn">
          {outside === 1
            ? "One milestone falls outside the campaign dates."
            : `${outside} milestones fall outside the campaign dates.`}{" "}
          That's allowed, but check it's intended.
        </p>
      )}
      <div className="section-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn-mini" onClick={add}>
          + Add milestone
        </button>
      </div>
      {removing && removingPost && (
        <MilestonePostDeleteDialog
          milestone={removing}
          post={removingPost}
          onDeletePost={() => confirmRemoval(true)}
          onKeepPost={() => confirmRemoval(false)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}

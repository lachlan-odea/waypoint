import { useState } from "react";
import type { SocialPost } from "../types";
import { socialChannelColor, socialStatusMeta } from "../constants";
import { formatShort } from "../dates";
import { writeDraggedSocialPostId } from "../dnd";
import { socialPostTitle } from "../socialPosts";
import { LinkedInGlyph } from "./LinkedInGlyph";
import { firstEmbeddableImage } from "../assetLinks";

type Props = {
  post: SocialPost;
  onClick: () => void;
  // Library and tray cards have room to show a line of the copy and the
  // post's date (or lack of one); calendar cells don't.
  detailed?: boolean;
  // Title of the board project this post is linked to, when it has one.
  projectTitle?: string;
  // Open that project's detail window. Clicking the project on the card
  // goes here instead of opening the post.
  onOpenProject?: () => void;
};

// "Jess R." → "JR", "Maddie" → "M", "AM" → "AM". Owners are free text, not
// designers, so there's no stored initials to lean on.
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1 && words[0].length <= 2) return words[0].toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const glyph = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function PaperclipGlyph() {
  return (
    <svg {...glyph}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg {...glyph}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function ProjectGlyph() {
  return (
    <svg {...glyph}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function SocialPostCard({
  post,
  onClick,
  detailed,
  projectTitle,
  onOpenProject,
}: Props) {
  const [dragging, setDragging] = useState(false);
  // Detailed cards (tray, library) show a thumbnail when the asset is a
  // direct image. A link that turns out not to be one just disappears —
  // the card is still complete without it.
  const [thumbFailed, setThumbFailed] = useState(false);
  const channelColor = socialChannelColor(post.channel);
  const status = socialStatusMeta(post.status);
  const title = socialPostTitle(post);
  const copyLine = detailed ? excerpt(post.copy) : "";
  const thumb = detailed && !thumbFailed ? firstEmbeddableImage(post.asset) : null;

  // The project link is a real button inside the card, and a button can't
  // nest inside a button, so the card itself is a keyboard-operable div.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  const projectLink = projectTitle && (
    <button
      type="button"
      className={`soc-card-project ${detailed ? "" : "compact"}`}
      title={`Open project: ${projectTitle}`}
      aria-label={`Open project ${projectTitle}`}
      disabled={!onOpenProject}
      onClick={(e) => {
        e.stopPropagation();
        onOpenProject?.();
      }}
      // Don't let a click here start a card drag or bubble as a card click.
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
    >
      <ProjectGlyph />
      {detailed && <span>{projectTitle}</span>}
    </button>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`soc-card ${detailed ? "detailed" : ""} ${
        post.status === "cancelled" ? "cancelled" : ""
      } ${dragging ? "dragging" : ""}`}
      // The left edge is the channel; the status colour also washes the
      // card background (via --status in the CSS) so a month reads at a
      // glance — green done, pink waiting, grey draft.
      style={{
        borderLeftColor: channelColor,
        ["--status" as string]: status.color,
      } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={(e) => {
        writeDraggedSocialPostId(e, post.id);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      title={title}
    >
      <div className="soc-card-top">
        <span className="soc-chip" style={{ background: channelColor }}>
          {post.channel || "No channel"}
        </span>
        <span
          className="soc-status"
          style={{ background: status.color }}
          title={`Status: ${status.label}`}
        >
          <span className="soc-status-label">{status.label}</span>
        </span>
      </div>
      <div className="soc-card-title">{title}</div>
      {thumb && (
        <img
          className="soc-card-thumb"
          src={thumb.previewUrl ?? thumb.url}
          alt=""
          loading="lazy"
          onError={() => setThumbFailed(true)}
        />
      )}
      {copyLine && <p className="soc-card-copy">{copyLine}</p>}
      {detailed && projectLink}
      <div className="soc-card-foot">
        {detailed && (
          <span className="soc-card-date">
            {post.date ? formatShort(post.date) : "Unscheduled"}
          </span>
        )}
        <span className="soc-card-links">
          {post.asset && (
            <span title="Asset attached">
              <PaperclipGlyph />
            </span>
          )}
          {post.ctaLink && (
            <span title="Has a CTA link">
              <LinkGlyph />
            </span>
          )}
          {!detailed && projectLink}
          {post.postUrl && (
            <span className="soc-card-live" title="Live on LinkedIn">
              <LinkedInGlyph size={11} />
            </span>
          )}
        </span>
        {post.owner && (
          <span className="soc-owner" title={`Owner: ${post.owner}`}>
            {initialsOf(post.owner)}
          </span>
        )}
      </div>
    </div>
  );
}

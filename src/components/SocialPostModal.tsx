import { useEffect, useState } from "react";
import type { SocialPost, SocialPostStatus } from "../types";
import { SOCIAL_POST_STATUSES } from "../constants";
import { todayIso } from "../dates";

type Props = {
  // Everything known about the post so far. For a new post this is whatever
  // the calendar could pre-fill — the clicked date, the month in view, or
  // the copy of an evergreen post being reused.
  initial: Partial<SocialPost>;
  mode: "create" | "edit";
  // Suggestions for the free-text fields, built from what's already in use.
  channels: string[];
  owners: string[];
  onCancel: () => void;
  onSave: (post: SocialPost) => void;
  onDelete?: () => void;
};

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

function newPostId(): string {
  return `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SocialPostModal({
  initial,
  mode,
  channels,
  owners,
  onCancel,
  onSave,
  onDelete,
}: Props) {
  const [topic, setTopic] = useState(initial.topic ?? "");
  const [channel, setChannel] = useState(initial.channel ?? channels[0] ?? "");
  const [owner, setOwner] = useState(initial.owner ?? "");
  const [date, setDate] = useState(initial.date ?? "");
  const [status, setStatus] = useState<SocialPostStatus>(
    initial.status ?? (initial.evergreen ? "backlog" : "draft"),
  );
  const [copy, setCopy] = useState(initial.copy ?? "");
  const [asset, setAsset] = useState(initial.asset ?? "");
  const [screenshot, setScreenshot] = useState(initial.screenshot ?? "");
  const [ctaLink, setCtaLink] = useState(initial.ctaLink ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [evergreen, setEvergreen] = useState(initial.evergreen ?? false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canSave = topic.trim().length > 0 || copy.trim().length > 0;

  function submit() {
    if (!canSave) return;
    const post: SocialPost = {
      id: initial.id ?? newPostId(),
      // A dated post lives in its date's month. An undated one keeps the
      // month it was filed under so it stays visible in that month's tray.
      month: date ? date.slice(0, 7) : initial.month || todayIso().slice(0, 7),
      date,
      channel: channel.trim(),
      topic: topic.trim(),
      copy: copy.trimEnd(),
      screenshot: screenshot.trim(),
      asset: asset.trim(),
      ctaLink: ctaLink.trim(),
      status,
      notes: notes.trimEnd(),
      owner: owner.trim(),
      evergreen,
      createdAt: initial.createdAt ?? new Date().toISOString(),
      source: initial.source ?? "manual",
    };
    onSave(post);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">
              {mode === "create" ? "New social post" : "Edit social post"}
            </h2>
            {initial.source === "import" && (
              <div className="modal-sub">
                Imported from the 2026 social media calendar spreadsheet
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Topic</span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What the post is about"
              autoFocus
            />
          </label>

          <div className="modal-grid">
            <label className="field">
              <span>Channel</span>
              <input
                list="soc-channel-options"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="CargoWise"
              />
              <datalist id="soc-channel-options">
                {channels.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Owner</span>
              <input
                list="soc-owner-options"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Who's driving it"
              />
              <datalist id="soc-owner-options">
                {owners.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Publish date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <span className="field-hint">
                Leave blank to park it in the month's Unscheduled tray.
              </span>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SocialPostStatus)}
              >
                {SOCIAL_POST_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Copy</span>
            <textarea
              className="soc-copy-input"
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
              rows={8}
              placeholder="The post text, as it will be published"
            />
          </label>

          <div className="modal-grid">
            <label className="field">
              <span>Asset</span>
              <input
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder="Link to the image, video or PDF"
              />
              {isUrl(asset) && (
                <a
                  className="brief-link"
                  href={asset.trim()}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open asset ↗
                </a>
              )}
            </label>
            <label className="field">
              <span>Screenshot</span>
              <input
                value={screenshot}
                onChange={(e) => setScreenshot(e.target.value)}
                placeholder="Link to a preview of the post"
              />
              {isUrl(screenshot) && (
                <a
                  className="brief-link"
                  href={screenshot.trim()}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open screenshot ↗
                </a>
              )}
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>CTA link</span>
              <input
                value={ctaLink}
                onChange={(e) => setCtaLink(e.target.value)}
                placeholder="https://…"
              />
              {isUrl(ctaLink) && (
                <a
                  className="brief-link"
                  href={ctaLink.trim()}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open link ↗
                </a>
              )}
            </label>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Timing, tags, anything the poster needs to know"
            />
          </label>

          <label className="soc-check">
            <input
              type="checkbox"
              checked={evergreen}
              onChange={(e) => setEvergreen(e.target.checked)}
            />
            <span>
              Keep in the evergreen library
              <span className="soc-check-hint">
                Reusable copy with no event dependency. Shows under Evergreen so it can be scheduled again later.
              </span>
            </span>
          </label>
        </div>

        <footer className="modal-foot">
          {mode === "edit" && onDelete && (
            confirmingDelete ? (
              <>
                <span className="delete-confirm-prompt">Delete this post?</span>
                <button className="danger" onClick={onDelete}>
                  Yes, delete
                </button>
                <button onClick={() => setConfirmingDelete(false)}>Keep</button>
              </>
            ) : (
              <button
                className="danger"
                style={{ marginRight: "auto" }}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            )
          )}
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit} disabled={!canSave}>
            {mode === "create" ? "Add post" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}

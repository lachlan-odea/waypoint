import { useEffect, useMemo, useState } from "react";
import type {
  MilestoneType,
  SocialCategory,
  SocialConfig,
  SocialHashtag,
} from "../types";
import { normaliseHashtag } from "../socialPosts";

type Props = {
  // The live config (or the defaults, if none has been saved yet).
  config: SocialConfig;
  // How many posts currently carry each category label — shown beside the
  // row and used to word the delete warning.
  categoryUsage: Map<string, number>;
  onSave: (config: SocialConfig) => Promise<void>;
  // Rename pass over posts: every post with `oldLabel` gets `newLabel`.
  onRelabelCategory: (oldLabel: string, newLabel: string) => Promise<number>;
  onClose: () => void;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Steps of the CargoWise palette, each dark enough to carry white text.
const PALETTE = [
  "#371ee1", "#6a5cd8", "#244349", "#a3294d", "#b4501f",
  "#2f6fb0", "#1f7a4d", "#1d1765", "#6b7a12", "#c2335f",
];

// Super-user editor for the Social calendar's shared configuration: the
// category list (label, short pill text, colour, order) and the company
// hashtag list. Edits are local until Save, which writes the whole document
// in one go and then relabels the posts of any category whose name changed.
export function ManageSocialModal({
  config,
  categoryUsage,
  onSave,
  onRelabelCategory,
  onClose,
}: Props) {
  const [categories, setCategories] = useState<SocialCategory[]>(() =>
    config.categories.map((c) => ({ ...c })),
  );
  const [hashtags, setHashtags] = useState<SocialHashtag[]>(() =>
    config.hashtags.map((h) => ({ ...h })),
  );
  // Project content types are plain strings; rows are keyed by position.
  const [contentTypes, setContentTypes] = useState<string[]>(() => [
    ...(config.contentTypes ?? []),
  ]);
  const [milestoneTypes, setMilestoneTypes] = useState<MilestoneType[]>(() =>
    (config.milestoneTypes ?? []).map((t) => ({ ...t })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const originalLabelById = useMemo(
    () => new Map(config.categories.map((c) => [c.id, c.label])),
    [config.categories],
  );

  const dirty = useMemo(
    () =>
      JSON.stringify({ categories, hashtags, contentTypes, milestoneTypes }) !==
      JSON.stringify({
        categories: config.categories,
        hashtags: config.hashtags,
        contentTypes: config.contentTypes ?? [],
        milestoneTypes: config.milestoneTypes ?? [],
      }),
    [categories, hashtags, contentTypes, milestoneTypes, config],
  );

  // ── milestone types ──────────────────────────────────────────────────

  function patchMilestoneType(id: string, patch: Partial<MilestoneType>) {
    setMilestoneTypes((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function moveMilestoneType(id: string, delta: -1 | 1) {
    setMilestoneTypes((cur) => {
      const i = cur.findIndex((t) => t.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addMilestoneType() {
    setMilestoneTypes((cur) => [...cur, { id: newId("ms"), label: "", social: false }]);
  }

  function removeMilestoneType(id: string) {
    setMilestoneTypes((cur) => cur.filter((t) => t.id !== id));
  }

  // ── content types ────────────────────────────────────────────────────

  function patchContentType(index: number, value: string) {
    setContentTypes((cur) => cur.map((t, i) => (i === index ? value : t)));
  }

  function moveContentType(index: number, delta: -1 | 1) {
    setContentTypes((cur) => {
      const j = index + delta;
      if (j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function addContentType() {
    setContentTypes((cur) => [...cur, ""]);
  }

  function removeContentType(index: number) {
    setContentTypes((cur) => cur.filter((_, i) => i !== index));
  }

  // ── categories ───────────────────────────────────────────────────────

  function patchCategory(id: string, patch: Partial<SocialCategory>) {
    setCategories((cur) =>
      cur.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function moveCategory(id: string, delta: -1 | 1) {
    setCategories((cur) => {
      const i = cur.findIndex((c) => c.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addCategory() {
    const color = PALETTE[categories.length % PALETTE.length];
    setCategories((cur) => [
      ...cur,
      { id: newId("cat"), label: "", short: "", color },
    ]);
  }

  function removeCategory(cat: SocialCategory) {
    const used = categoryUsage.get(cat.label) ?? 0;
    const warning = used
      ? `\n\n${used} post${used === 1 ? " uses" : "s use"} it. They keep the label and show it in grey until someone re-categorises them.`
      : "";
    if (!window.confirm(`Remove the “${cat.label || "untitled"}” category?${warning}`)) return;
    setCategories((cur) => cur.filter((c) => c.id !== cat.id));
  }

  // ── hashtags ─────────────────────────────────────────────────────────

  function patchHashtag(id: string, patch: Partial<SocialHashtag>) {
    setHashtags((cur) => cur.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  function addHashtag() {
    setHashtags((cur) => [...cur, { id: newId("tag"), tag: "", note: "" }]);
  }

  function removeHashtag(id: string) {
    setHashtags((cur) => cur.filter((h) => h.id !== id));
  }

  // ── save ─────────────────────────────────────────────────────────────

  function validate(): { config: SocialConfig } | { error: string } {
    const cleanCategories = categories.map((c) => ({
      ...c,
      label: c.label.trim(),
      short: c.short.trim() || c.label.trim(),
      color: c.color,
    }));
    if (cleanCategories.some((c) => !c.label)) {
      return { error: "Every category needs a name." };
    }
    const labels = cleanCategories.map((c) => c.label.toLowerCase());
    const dupLabel = labels.find((l, i) => labels.indexOf(l) !== i);
    if (dupLabel) {
      return { error: `Two categories are called “${dupLabel}”. Names have to be unique.` };
    }

    const cleanHashtags = hashtags
      .map((h) => ({
        ...h,
        tag: normaliseHashtag(h.tag),
        ...(h.note?.trim() ? { note: h.note.trim() } : {}),
      }))
      .map(({ note, ...rest }) => (note ? { ...rest, note } : rest));
    if (cleanHashtags.some((h) => !h.tag)) {
      return { error: "Every hashtag needs some text after the #." };
    }
    const tags = cleanHashtags.map((h) => h.tag.toLowerCase());
    const dupTag = tags.find((t, i) => tags.indexOf(t) !== i);
    if (dupTag) {
      return { error: `${dupTag} is listed twice.` };
    }
    const cleanContentTypes = contentTypes.map((t) => t.trim());
    if (cleanContentTypes.some((t) => !t)) {
      return { error: "Every content type needs a name — remove any blank rows." };
    }
    const lowerTypes = cleanContentTypes.map((t) => t.toLowerCase());
    const dupType = lowerTypes.find((t, i) => lowerTypes.indexOf(t) !== i);
    if (dupType) {
      return { error: `“${dupType}” is listed twice under content types.` };
    }

    const cleanMilestoneTypes = milestoneTypes.map((t) => ({ ...t, label: t.label.trim() }));
    if (cleanMilestoneTypes.some((t) => !t.label)) {
      return { error: "Every milestone type needs a name — remove any blank rows." };
    }
    const lowerMilestones = cleanMilestoneTypes.map((t) => t.label.toLowerCase());
    const dupMilestone = lowerMilestones.find((t, i) => lowerMilestones.indexOf(t) !== i);
    if (dupMilestone) {
      return { error: `“${dupMilestone}” is listed twice under milestone types.` };
    }

    return {
      config: {
        categories: cleanCategories,
        hashtags: cleanHashtags,
        contentTypes: cleanContentTypes,
        milestoneTypes: cleanMilestoneTypes,
      },
    };
  }

  async function save() {
    const result = validate();
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await onSave(result.config);
      // Renames: same id, different label. Relabel the posts so they follow.
      let relabelled = 0;
      for (const c of result.config.categories) {
        const before = originalLabelById.get(c.id);
        if (before && before !== c.label) {
          relabelled += await onRelabelCategory(before, c.label);
        }
      }
      setSaved(
        relabelled > 0
          ? `Saved. ${relabelled} post${relabelled === 1 ? "" : "s"} moved to the renamed categor${relabelled === 1 ? "y" : "ies"}.`
          : "Saved.",
      );
      // Reflect the tidied values (trimmed labels, normalised tags).
      setCategories(result.config.categories);
      setHashtags(result.config.hashtags);
      setContentTypes(result.config.contentTypes ?? []);
      setMilestoneTypes(result.config.milestoneTypes ?? []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">Types &amp; tags</h2>
            <div className="modal-sub">
              Types for posts and campaigns, company hashtags, campaign milestone
              types and project content types — shared by everyone
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Category types</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Each social post and each campaign can carry one type. The{" "}
              <strong>pill text</strong> is what fits on a calendar card, so
              keep it short; the full name is the picker option and the
              tooltip. Order here is the order of the pickers and the filter
              rows.
            </p>
            <div className="manage-social-list">
              {categories.map((c, i) => (
                <div key={c.id} className="manage-social-row">
                  <label className="manage-social-color" title="Pill colour">
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => patchCategory(c.id, { color: e.target.value })}
                      disabled={busy}
                    />
                    <span
                      className="soc-category manage-social-preview"
                      style={{
                        color: c.color,
                        borderColor: c.color,
                        ["--category" as string]: c.color,
                      } as React.CSSProperties}
                    >
                      {c.short.trim() || c.label.trim() || "Pill"}
                    </span>
                  </label>
                  <input
                    className="manage-social-label"
                    value={c.label}
                    placeholder="Category name"
                    onChange={(e) => patchCategory(c.id, { label: e.target.value })}
                    disabled={busy}
                  />
                  <input
                    className="manage-social-short"
                    value={c.short}
                    placeholder="Pill text"
                    onChange={(e) => patchCategory(c.id, { short: e.target.value })}
                    disabled={busy}
                  />
                  <span className="manage-social-usage muted small">
                    {(() => {
                      const n = categoryUsage.get(originalLabelById.get(c.id) ?? c.label) ?? 0;
                      return n ? `${n} post${n === 1 ? "" : "s"}` : "unused";
                    })()}
                  </span>
                  <span className="manage-social-actions">
                    <button
                      className="icon-btn"
                      onClick={() => moveCategory(c.id, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => moveCategory(c.id, 1)}
                      disabled={busy || i === categories.length - 1}
                      aria-label="Move down"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="link-btn"
                      onClick={() => removeCategory(c)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div className="section-actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn-mini" onClick={addCategory} disabled={busy}>
                + Add category
              </button>
            </div>
          </section>

          <section className="modal-section">
            <h3>Company hashtags</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              The tags the team should use consistently. They appear as
              one-click chips under the copy in the post editor, and the note
              says when each applies.
            </p>
            <div className="manage-social-list">
              {hashtags.map((h) => (
                <div key={h.id} className="manage-social-row hashtag">
                  <input
                    className="manage-social-tag"
                    value={h.tag}
                    placeholder="#Hashtag"
                    onChange={(e) => patchHashtag(h.id, { tag: e.target.value })}
                    onBlur={(e) =>
                      patchHashtag(h.id, { tag: normaliseHashtag(e.target.value) || e.target.value })
                    }
                    disabled={busy}
                  />
                  <input
                    className="manage-social-note"
                    value={h.note ?? ""}
                    placeholder="When to use it (optional)"
                    onChange={(e) => patchHashtag(h.id, { note: e.target.value })}
                    disabled={busy}
                  />
                  <span className="manage-social-actions">
                    <button
                      className="link-btn"
                      onClick={() => removeHashtag(h.id)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
              {hashtags.length === 0 && (
                <p className="muted small">No hashtags yet.</p>
              )}
            </div>
            <div className="section-actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn-mini" onClick={addHashtag} disabled={busy}>
                + Add hashtag
              </button>
            </div>
          </section>

          <section className="modal-section">
            <h3>Campaign milestone types</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              The options in a campaign milestone's <strong>type</strong>{" "}
              picker. Tick <strong>Social post</strong> for types that should
              put a draft post on the Social calendar when the milestone is
              saved. Renaming or removing one leaves existing milestones on
              their old wording.
            </p>
            <div className="manage-social-list">
              {milestoneTypes.map((t, i) => (
                <div key={t.id} className="manage-social-row milestonetype">
                  <input
                    value={t.label}
                    placeholder="Milestone type"
                    onChange={(e) => patchMilestoneType(t.id, { label: e.target.value })}
                    disabled={busy}
                  />
                  <label className="manage-social-check">
                    <input
                      type="checkbox"
                      checked={t.social}
                      onChange={(e) => patchMilestoneType(t.id, { social: e.target.checked })}
                      disabled={busy}
                    />
                    Social post
                  </label>
                  <span className="manage-social-actions">
                    <button
                      className="icon-btn"
                      onClick={() => moveMilestoneType(t.id, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => moveMilestoneType(t.id, 1)}
                      disabled={busy || i === milestoneTypes.length - 1}
                      aria-label="Move down"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="link-btn"
                      onClick={() => removeMilestoneType(t.id)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
              {milestoneTypes.length === 0 && (
                <p className="muted small">
                  No milestone types — the campaign editor will have nothing to pick.
                </p>
              )}
            </div>
            <div className="section-actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn-mini" onClick={addMilestoneType} disabled={busy}>
                + Add milestone type
              </button>
            </div>
          </section>

          <section className="modal-section">
            <h3>Project content types</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              The chips offered under <strong>Content type</strong> when
              creating or editing a project (Web, Email, Video…). A project
              can carry several. Removing one here leaves it on projects that
              already have it — they keep showing it as a custom chip.
            </p>
            <div className="manage-social-list">
              {contentTypes.map((t, i) => (
                <div key={i} className="manage-social-row contenttype">
                  <input
                    value={t}
                    placeholder="Content type"
                    onChange={(e) => patchContentType(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addContentType();
                      }
                    }}
                    disabled={busy}
                  />
                  <span className="manage-social-actions">
                    <button
                      className="icon-btn"
                      onClick={() => moveContentType(i, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => moveContentType(i, 1)}
                      disabled={busy || i === contentTypes.length - 1}
                      aria-label="Move down"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="link-btn"
                      onClick={() => removeContentType(i)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
              {contentTypes.length === 0 && (
                <p className="muted small">
                  No content types — the project editor will only offer “Other…”.
                </p>
              )}
            </div>
            <div className="section-actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn-mini" onClick={addContentType} disabled={busy}>
                + Add content type
              </button>
            </div>
          </section>

          {error && <p className="login-error">{error}</p>}
          {saved && !dirty && <p className="manage-social-saved">{saved}</p>}
        </div>

        <footer className="modal-foot">
          {dirty && !busy && (
            <span className="muted small" style={{ marginRight: "auto" }}>
              Unsaved changes
            </span>
          )}
          <button onClick={onClose} disabled={busy}>
            {dirty ? "Cancel" : "Done"}
          </button>
          <button className="primary" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}

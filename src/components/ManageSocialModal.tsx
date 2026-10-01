import { useEffect, useMemo, useState } from "react";
import type { SocialCategory, SocialConfig, SocialHashtag } from "../types";
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

const PALETTE = [
  "#2563eb", "#7c3aed", "#0f766e", "#db2777", "#ea580c",
  "#c026d3", "#4d7c0f", "#b45309", "#0891b2", "#be123c",
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
      JSON.stringify({ categories, hashtags }) !==
      JSON.stringify({ categories: config.categories, hashtags: config.hashtags }),
    [categories, hashtags, config],
  );

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
    return { config: { categories: cleanCategories, hashtags: cleanHashtags } };
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
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">Social calendar</h2>
            <div className="modal-sub">
              Categories and company hashtags, shared by everyone who uses the calendar
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Categories</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Each post can carry one category. The <strong>pill text</strong>{" "}
              is what fits on a calendar card, so keep it short; the full name
              is the picker option and the tooltip. Order here is the order of
              the picker and the filter row.
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

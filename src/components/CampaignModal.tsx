import { useEffect, useState } from "react";
import type {
  Campaign,
  CampaignMilestone,
  Project,
  SocialCategory,
  Workspace,
} from "../types";
import { BRANDS, brandColor, brandForChannel } from "../constants";
import { formatShort, shiftIso, todayIso } from "../dates";
import { ProjectPicker } from "./ProjectPicker";

type Props = {
  initial: Partial<Campaign>;
  mode: "create" | "edit";
  // The Social calendar's category list; campaigns use the same types.
  categories: SocialCategory[];
  owners: string[];
  // Board projects that can be linked as contributing to the campaign.
  projects: Project[];
  workspaces: Workspace[];
  onCancel: () => void;
  onSave: (campaign: Campaign) => void;
  onDelete?: () => void;
  // Jump to a linked project's window. Closes this editor first.
  onOpenProject?: (projectId: string) => void;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function CampaignModal({
  initial,
  mode,
  categories,
  owners,
  projects,
  workspaces,
  onCancel,
  onSave,
  onDelete,
  onOpenProject,
}: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  // Brand drives the colour. A campaign saved before brands existed opens
  // with the brand its old channel implied; a brand-new one starts on the
  // first brand in the list.
  const [brand, setBrand] = useState(
    initial.brand || (initial.channel ? brandForChannel(initial.channel) : BRANDS[0]),
  );
  const [owner, setOwner] = useState(initial.owner ?? "");
  const [startDate, setStartDate] = useState(initial.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(
    initial.endDate ?? shiftIso(initial.startDate ?? todayIso(), 13),
  );
  const [description, setDescription] = useState(initial.description ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(initial.projectIds ?? []);
  const [milestones, setMilestones] = useState<CampaignMilestone[]>(() =>
    (initial.milestones ?? []).map((m) => ({ ...m })),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const datesValid = !!startDate && !!endDate && endDate >= startDate;
  const canSave = name.trim().length > 0 && datesValid;
  const color = brandColor(brand);

  // ── milestones ───────────────────────────────────────────────────────

  function patchMilestone(id: string, patch: Partial<CampaignMilestone>) {
    setMilestones((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function addMilestone() {
    // Default to the day after the last milestone, or the start date, so a
    // run of "EDM 1 / EDM 2 / EDM 3" needs a label each and little else.
    const last = milestones[milestones.length - 1];
    const date = last?.date ? shiftIso(last.date, 1) : startDate;
    setMilestones((cur) => [
      ...cur,
      { id: newId("ms"), date, label: "", done: false },
    ]);
  }

  function removeMilestone(id: string) {
    setMilestones((cur) => cur.filter((m) => m.id !== id));
  }

  // ── save ─────────────────────────────────────────────────────────────

  function submit() {
    if (!canSave) return;
    const cleanMilestones = milestones
      .map((m) => ({ ...m, label: m.label.trim() }))
      .filter((m) => m.label && m.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (cleanMilestones.length !== milestones.length) {
      setError("Every milestone needs a date and a label — remove any blank rows.");
      return;
    }
    const campaign: Campaign = {
      id: initial.id ?? newId("camp"),
      name: name.trim(),
      // Legacy field, carried through untouched if it was ever set.
      channel: initial.channel,
      category: category || undefined,
      brand,
      owner: owner.trim(),
      description: description.trimEnd(),
      startDate,
      endDate,
      color,
      milestones: cleanMilestones,
      projectIds,
      createdAt: initial.createdAt ?? new Date().toISOString(),
    };
    onSave(campaign);
  }

  const outside = milestones.filter(
    (m) => m.date && (m.date < startDate || m.date > endDate),
  ).length;

  const linkedProjects = projectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p);

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">
              {mode === "create" ? "New campaign" : "Edit campaign"}
            </h2>
            {datesValid && (
              <div className="modal-sub">
                <span className="camp-brand-dot" style={{ background: color }} />
                {brand} · {formatShort(startDate)} – {formatShort(endDate)}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Campaign name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Digital Documentation launch"
              autoFocus
            />
          </label>

          <div className="modal-grid">
            <label className="field">
              <span>Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartDate(next);
                  if (next && endDate && endDate < next) setEndDate(next);
                }}
              />
            </label>
            <label className="field">
              <span>End date</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
              {!datesValid && startDate && endDate && (
                <span className="field-hint warn">End date is before the start.</span>
              )}
            </label>
            <label className="field">
              <span>Brand</span>
              <div className="camp-brand-field">
                <span className="camp-brand-dot" style={{ background: color }} aria-hidden />
                <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  {brand && !(BRANDS as readonly string[]).includes(brand) && (
                    <option value={brand}>{brand}</option>
                  )}
                </select>
              </div>
              <span className="field-hint">
                Sets the campaign's colour on the timeline and the post calendar.
              </span>
            </label>
            <label className="field">
              <span>Type</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">No type</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.label}>
                    {c.label}
                  </option>
                ))}
                {category && !categories.some((c) => c.label === category) && (
                  <option value={category}>{category} (no longer in the list)</option>
                )}
              </select>
              <span className="field-hint">
                The same types the Social calendar's posts use, so a campaign
                and its posts filter together.
              </span>
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Owner</span>
              <input
                list="camp-owner-options"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Who's running it"
              />
              <datalist id="camp-owner-options">
                {owners.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What the campaign is, who it's for, where it lands"
            />
          </label>

          <div className="asset-field">
            <label className="field">
              <span>Contributing projects</span>
            </label>
            <ProjectPicker
              projects={projects}
              workspaces={workspaces}
              value={projectIds}
              onChange={setProjectIds}
              placeholder="Search projects to link — the EDM, the landing page, the social assets…"
            />
            <div className="soc-project-row">
              <span className="field-hint">
                Every board project doing work for this campaign. Each project's
                window lists the campaigns it belongs to.
              </span>
            </div>
            {onOpenProject && linkedProjects.length > 0 && (
              <div className="camp-linked-open">
                <span className="muted small">Open:</span>
                {linkedProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn-mini"
                    onClick={() => onOpenProject(p.id)}
                    title="Close this campaign and open the project"
                  >
                    {p.title} ↗
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-section camp-milestones">
            <h3>Milestones</h3>
            <p className="muted small" style={{ margin: "0 0 8px" }}>
              Dated moments inside the campaign — EDM sends, landing page live,
              webinar day. Each shows as a diamond on the campaign bar; tick it
              once it has happened.
            </p>
            {milestones.length === 0 ? (
              <p className="muted small">No milestones yet.</p>
            ) : (
              <div className="camp-ms-list">
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className={`camp-ms-row ${
                      m.date && (m.date < startDate || m.date > endDate) ? "outside" : ""
                    }`}
                  >
                    <label className="camp-ms-done" title="Done">
                      <input
                        type="checkbox"
                        checked={m.done}
                        onChange={(e) => patchMilestone(m.id, { done: e.target.checked })}
                      />
                    </label>
                    <input
                      type="date"
                      value={m.date}
                      onChange={(e) => patchMilestone(m.id, { date: e.target.value })}
                    />
                    <input
                      value={m.label}
                      placeholder="e.g. EDM 1 sent"
                      onChange={(e) => patchMilestone(m.id, { label: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addMilestone();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => removeMilestone(m.id)}
                    >
                      Remove
                    </button>
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
              <button type="button" className="btn-mini" onClick={addMilestone}>
                + Add milestone
              </button>
            </div>
          </div>

          {error && <p className="login-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          {mode === "edit" && onDelete && (
            confirmingDelete ? (
              <>
                <span className="delete-confirm-prompt">Delete this campaign?</span>
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
            {mode === "create" ? "Add campaign" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}

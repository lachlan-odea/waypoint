import { useEffect, useState } from "react";
import type { Campaign, CampaignMilestone } from "../types";
import { CAMPAIGN_COLORS } from "../constants";
import { formatShort, shiftIso, todayIso } from "../dates";

type Props = {
  initial: Partial<Campaign>;
  mode: "create" | "edit";
  channels: string[];
  owners: string[];
  // How many campaigns exist, to pick the next palette colour for a new one.
  campaignCount: number;
  onCancel: () => void;
  onSave: (campaign: Campaign) => void;
  onDelete?: () => void;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function CampaignModal({
  initial,
  mode,
  channels,
  owners,
  campaignCount,
  onCancel,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [channel, setChannel] = useState(initial.channel ?? channels[0] ?? "");
  const [channelIsCustom, setChannelIsCustom] = useState(
    () => !!initial.channel && !channels.includes(initial.channel),
  );
  const [owner, setOwner] = useState(initial.owner ?? "");
  const [startDate, setStartDate] = useState(initial.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(
    initial.endDate ?? shiftIso(initial.startDate ?? todayIso(), 13),
  );
  const [color, setColor] = useState(
    initial.color ?? CAMPAIGN_COLORS[campaignCount % CAMPAIGN_COLORS.length],
  );
  const [description, setDescription] = useState(initial.description ?? "");
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
      channel: channel.trim(),
      owner: owner.trim(),
      description: description.trimEnd(),
      startDate,
      endDate,
      color,
      milestones: cleanMilestones,
      createdAt: initial.createdAt ?? new Date().toISOString(),
    };
    onSave(campaign);
  }

  const outside = milestones.filter(
    (m) => m.date && (m.date < startDate || m.date > endDate),
  ).length;

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
                {formatShort(startDate)} – {formatShort(endDate)}
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
              <span>Channel</span>
              <select
                value={channelIsCustom ? "__other__" : channel}
                onChange={(e) => {
                  if (e.target.value === "__other__") {
                    setChannelIsCustom(true);
                    setChannel("");
                  } else {
                    setChannelIsCustom(false);
                    setChannel(e.target.value);
                  }
                }}
              >
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__other__">Other…</option>
              </select>
              {channelIsCustom && (
                <input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="Channel name"
                  autoFocus
                />
              )}
            </label>
            <label className="field">
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

          <div className="field">
            <span>Colour</span>
            <div className="camp-colors">
              {CAMPAIGN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`camp-color ${color === c ? "active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                />
              ))}
              <label className="camp-color-custom" title="Custom colour">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>
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

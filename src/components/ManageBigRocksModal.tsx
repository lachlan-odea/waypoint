import { useEffect, useMemo, useState } from "react";
import type { BigRock } from "../types";
import { BIG_ROCK_PALETTE, newBigRockId } from "../bigRocks";
import { Icon } from "./Icon";

type Props = {
  rocks: BigRock[];
  // How many projects and campaigns carry each rock, by id — shown beside
  // the row and used to word the remove warning.
  usage: Map<string, number>;
  onSave: (rocks: BigRock[], removedIds: string[]) => Promise<void>;
  onClose: () => void;
};

// Super-user editor for the Big Rocks: name, a line on each, colour,
// order, and whether it's retired. Edits are local until Save, which
// writes the whole list in one batch (saveBigRocks in firestore.ts).
export function ManageBigRocksModal({ rocks, usage, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<BigRock[]>(() => rocks.map((r) => ({ ...r })));
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = useMemo(
    () => removedIds.length > 0 || JSON.stringify(draft) !== JSON.stringify(rocks),
    [draft, removedIds, rocks],
  );

  function patch(id: string, p: Partial<BigRock>) {
    setDraft((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function move(id: string, delta: -1 | 1) {
    setDraft((cur) => {
      const i = cur.findIndex((r) => r.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function add() {
    setDraft((cur) => [
      ...cur,
      {
        id: newBigRockId(),
        name: "",
        description: "",
        color: BIG_ROCK_PALETTE[cur.length % BIG_ROCK_PALETTE.length],
        order: cur.length,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function remove(rock: BigRock) {
    const n = usage.get(rock.id) ?? 0;
    const warning = n
      ? `\n\n${n} project${n === 1 ? " or campaign carries" : "s and campaigns carry"} it. They'll lose the tag, and nothing will report against this rock any more. Retire it instead to keep that.`
      : "";
    if (!window.confirm(`Remove “${rock.name || "this Big Rock"}”?${warning}`)) return;
    setDraft((cur) => cur.filter((r) => r.id !== rock.id));
    // Only a rock that exists in Firestore needs deleting there.
    if (rocks.some((r) => r.id === rock.id)) setRemovedIds((cur) => [...cur, rock.id]);
  }

  async function save() {
    const clean: BigRock[] = draft.map((r, i) => {
      const { retired, ...rest } = r;
      const base = { ...rest, name: r.name.trim(), description: r.description.trim(), order: i };
      return retired ? { ...base, retired: true } : base;
    });
    if (clean.some((r) => !r.name)) {
      setError("Every Big Rock needs a name — remove any blank rows.");
      return;
    }
    const names = clean.map((r) => r.name.toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) {
      setError(`Two Big Rocks are called “${dup}”. Names have to be unique.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(clean, removedIds);
      setDraft(clean);
      setRemovedIds([]);
      setSaved(true);
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
            <h2 className="modal-title-static">Big Rocks</h2>
            <div className="modal-sub">
              The few things the team is working towards — tag campaigns and
              projects with them, and the Big Rocks page reports the rest
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Keep to a handful. Each rock gets a name, a line on what done looks
            like and a colour. Order here is the order everywhere. <strong>Retire</strong>{" "}
            a rock the team has finished with: it leaves the pickers but what
            was done for it still reports. <strong>Remove</strong> only a rock
            added by mistake — removing one takes the tag off every project and
            campaign that carried it.
          </p>

          <div className="manage-social-list">
            {draft.map((r, i) => {
              const n = usage.get(r.id) ?? 0;
              return (
                <div key={r.id} className={`manage-social-row rock ${r.retired ? "retired" : ""}`}>
                  <label className="manage-social-color" title="Colour">
                    <input
                      type="color"
                      value={r.color}
                      onChange={(e) => patch(r.id, { color: e.target.value })}
                      disabled={busy}
                    />
                  </label>
                  <input
                    value={r.name}
                    placeholder="Big Rock, e.g. Win the mid-market"
                    aria-label="Name"
                    onChange={(e) => patch(r.id, { name: e.target.value })}
                    disabled={busy}
                  />
                  <input
                    value={r.description}
                    placeholder="What it is, and what done looks like (optional)"
                    aria-label="Description"
                    onChange={(e) => patch(r.id, { description: e.target.value })}
                    disabled={busy}
                  />
                  <label className="manage-social-check" title="Finished with — leaves the pickers, keeps reporting">
                    <input
                      type="checkbox"
                      checked={!!r.retired}
                      onChange={(e) => patch(r.id, { retired: e.target.checked || undefined })}
                      disabled={busy}
                    />
                    Retired
                  </label>
                  <span className="manage-social-usage muted small">
                    {n ? `${n} item${n === 1 ? "" : "s"}` : "unused"}
                  </span>
                  <span className="manage-social-actions">
                    <button
                      className="icon-btn"
                      onClick={() => move(r.id, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => move(r.id, 1)}
                      disabled={busy || i === draft.length - 1}
                      aria-label="Move down"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button className="link-btn" onClick={() => remove(r)} disabled={busy}>
                      Remove
                    </button>
                  </span>
                </div>
              );
            })}
            {draft.length === 0 && (
              <p className="muted small">No Big Rocks yet. Add the first one below.</p>
            )}
          </div>
          <div className="section-actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn-mini" onClick={add} disabled={busy}>
              + Add Big Rock
            </button>
          </div>

          {error && <p className="login-error">{error}</p>}
          {saved && !dirty && <p className="manage-social-saved">Saved.</p>}
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

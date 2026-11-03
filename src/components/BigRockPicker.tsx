import type { BigRock } from "../types";
import { rocksFor } from "../bigRocks";

type PickerProps = {
  rocks: BigRock[];
  value: string[];
  onChange: (ids: string[]) => void;
};

// Toggle chips, one per Big Rock, in the style of the reviewer picker. A
// retired rock is offered only while it's still chosen, so a tag can be
// taken off but not put back on.
export function BigRockPicker({ rocks, value, onChange }: PickerProps) {
  const offered = rocks.filter((r) => !r.retired || value.includes(r.id));
  if (offered.length === 0) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        No Big Rocks yet. A super user defines them in Settings → Big Rocks.
      </p>
    );
  }
  return (
    <div className="assignee-picker rock-picker">
      {offered.map((r) => {
        const active = value.includes(r.id);
        return (
          <button
            type="button"
            key={r.id}
            className={`assignee-chip rock-chip ${active ? "active" : ""}`}
            aria-pressed={active}
            title={r.description || r.name}
            onClick={() =>
              onChange(active ? value.filter((id) => id !== r.id) : [...value, r.id])
            }
          >
            <i className="rock-dot" style={{ background: r.color }} aria-hidden="true" />
            {r.name}
            {r.retired ? " · retired" : ""}
          </button>
        );
      })}
    </div>
  );
}

// The rocks behind a list of ids, as read-only chips for a page header or
// a card. Renders nothing when there are none.
export function BigRockChips({
  rocks,
  ids,
}: {
  rocks: BigRock[];
  ids: string[] | undefined;
}) {
  const list = rocksFor(ids, rocks);
  if (list.length === 0) return null;
  return (
    <>
      {list.map((r) => (
        <span key={r.id} className="item-chip rock-tag" title={r.description || undefined}>
          <i className="rock-dot" style={{ background: r.color }} aria-hidden="true" />
          {r.name}
        </span>
      ))}
    </>
  );
}

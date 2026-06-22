import { useMemo, useRef, useState } from "react";
import type { Designer } from "../types";
import { Avatar } from "./Avatar";

type Props = {
  // Full designer pool the user can pick from. Anyone in this list who's
  // not already in `assigneeIds` shows up as a suggestion.
  designers: Designer[];
  assigneeIds: string[];
  onChange: (nextAssigneeIds: string[]) => void;
  placeholder?: string;
};

// Tag-style assignee picker: existing assignees render as removable chips,
// a single text input lets the user type-to-search and pick from
// suggestions. Anyone in the platform can be added — the team
// membership concept doesn't gate assignment.
export function AssigneePicker({
  designers,
  assigneeIds,
  onChange,
  placeholder = "Add assignee…",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Defer the blur-driven close so a click on a suggestion has time to
  // register before the dropdown unmounts.
  const blurTimer = useRef<number | null>(null);

  const assigneeIdSet = useMemo(() => new Set(assigneeIds), [assigneeIds]);
  const selected = useMemo(
    () =>
      assigneeIds
        .map((id) => designers.find((d) => d.id === id))
        .filter((d): d is Designer => !!d),
    [assigneeIds, designers],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return designers
      .filter((d) => !assigneeIdSet.has(d.id))
      .filter((d) => (q ? d.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [designers, assigneeIdSet, query]);

  function addAssignee(id: string) {
    if (assigneeIdSet.has(id)) return;
    onChange([...assigneeIds, id]);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  function removeAssignee(id: string) {
    onChange(assigneeIds.filter((x) => x !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = suggestions[highlight];
      if (pick) addAssignee(pick.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      // Backspace on an empty input pops the last assignee.
      removeAssignee(selected[selected.length - 1].id);
    }
  }

  return (
    <div className="assignee-tag-picker">
      <div
        className="assignee-tag-input"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((d) => (
          <span key={d.id} className="assignee-tag">
            <Avatar designer={d} className="dot-avatar assignee-tag-avatar" />
            <span className="assignee-tag-name">{d.name.split(" ")[0]}</span>
            <button
              type="button"
              className="assignee-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeAssignee(d.id);
              }}
              aria-label={`Remove ${d.name}`}
              tabIndex={-1}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="assignee-tag-text"
          type="text"
          value={query}
          placeholder={selected.length === 0 ? placeholder : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => {
            if (blurTimer.current) {
              window.clearTimeout(blurTimer.current);
              blurTimer.current = null;
            }
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="assignee-suggestions" role="listbox">
          {suggestions.map((d, i) => (
            <li
              key={d.id}
              role="option"
              aria-selected={i === highlight}
              className={`assignee-suggestion ${
                i === highlight ? "highlighted" : ""
              }`}
              // mousedown fires before blur, so the click lands before the
              // dropdown closes itself.
              onMouseDown={(e) => {
                e.preventDefault();
                addAssignee(d.id);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <Avatar designer={d} className="dot-avatar assignee-suggestion-avatar" />
              <span>{d.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

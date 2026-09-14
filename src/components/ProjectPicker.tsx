import { useMemo, useRef, useState } from "react";
import type { Project, Workspace } from "../types";

type Props = {
  projects: Project[];
  workspaces: Workspace[];
  // Selected project id, or "" for none.
  value: string;
  onChange: (projectId: string) => void;
  placeholder?: string;
};

// Single-select, type-to-search project picker, built on the same chip +
// suggestions styling as AssigneePicker. Archived projects are still
// offered (a post often promotes finished work) but say so.
export function ProjectPicker({
  projects,
  workspaces,
  value,
  onChange,
  placeholder = "Search projects by title, client or brand…",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);

  const selected = useMemo(
    () => projects.find((p) => p.id === value) ?? null,
    [projects, value],
  );

  const teamName = (workspaceId: string) =>
    workspaces.find((w) => w.id === workspaceId)?.name ?? workspaceId;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => p.id !== value)
      .filter((p) =>
        q
          ? [p.title, p.client, p.brand].join(" ").toLowerCase().includes(q)
          : true,
      )
      // Live work first, then archived; newest first within each.
      .sort((a, b) => {
        if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, 8);
  }, [projects, value, query]);

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setHighlight(0);
    setOpen(false);
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
      const hit = suggestions[highlight];
      if (hit) pick(hit.id);
    } else if (e.key === "Escape") {
      // Stop the modal's Escape handler closing the whole editor when all
      // the user meant was to dismiss the suggestions.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selected) {
      onChange("");
    }
  }

  // A stored id whose project has since been deleted: show that rather
  // than silently rendering an empty picker.
  const dangling = value && !selected;

  return (
    <div className="assignee-tag-picker project-picker">
      <div
        className="assignee-tag-input"
        onClick={() => inputRef.current?.focus()}
      >
        {selected && (
          <span className="assignee-tag project-tag" title={selected.title}>
            <span className="assignee-tag-name">{selected.title}</span>
            <span className="project-tag-team">{teamName(selected.workspaceId)}</span>
            <button
              type="button"
              className="assignee-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              aria-label="Unlink project"
              tabIndex={-1}
            >
              ×
            </button>
          </span>
        )}
        {dangling && (
          <span className="assignee-tag project-tag dangling">
            <span className="assignee-tag-name">Project no longer exists</span>
            <button
              type="button"
              className="assignee-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              aria-label="Clear"
              tabIndex={-1}
            >
              ×
            </button>
          </span>
        )}
        {!selected && (
          <input
            ref={inputRef}
            className="assignee-tag-text"
            type="text"
            value={query}
            placeholder={dangling ? "" : placeholder}
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
        )}
      </div>
      {open && !selected && suggestions.length > 0 && (
        <ul className="assignee-suggestions" role="listbox">
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === highlight}
              className={`assignee-suggestion project-suggestion ${
                i === highlight ? "highlighted" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p.id);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="project-suggestion-title">{p.title}</span>
              <span className="project-suggestion-meta">
                {[teamName(p.workspaceId), p.client, p.brand]
                  .filter(Boolean)
                  .join(" · ")}
                {p.archived ? " · archived" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

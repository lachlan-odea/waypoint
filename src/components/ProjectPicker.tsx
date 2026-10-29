import { useMemo, useRef, useState } from "react";
import type { Project, Workspace } from "../types";
import { Icon } from "./Icon";

type Props = {
  projects: Project[];
  workspaces: Workspace[];
  // Selected project ids, in order. Single-select callers pass at most one
  // and set `single`.
  value: string[];
  onChange: (projectIds: string[]) => void;
  // One project only: picking replaces the selection and the search box
  // hides while something is chosen.
  single?: boolean;
  placeholder?: string;
};

// Type-to-search project picker, built on the same chip + suggestions
// styling as AssigneePicker. Archived projects are still offered (a post or
// campaign often involves finished work) but say so.
export function ProjectPicker({
  projects,
  workspaces,
  value,
  onChange,
  single,
  placeholder = "Search projects by title, client or brand…",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);

  const selected = useMemo(
    () =>
      value
        .map((id) => projects.find((p) => p.id === id))
        .filter((p): p is Project => !!p),
    [projects, value],
  );
  // Stored ids whose project has since been deleted: shown so they can be
  // cleared, rather than silently dropped.
  const dangling = useMemo(
    () => value.filter((id) => !projects.some((p) => p.id === id)),
    [projects, value],
  );

  const teamName = (workspaceId: string) =>
    workspaces.find((w) => w.id === workspaceId)?.name ?? workspaceId;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(value);
    return projects
      .filter((p) => !chosen.has(p.id))
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
    onChange(single ? [id] : [...value, id]);
    setQuery("");
    setHighlight(0);
    if (single) setOpen(false);
    else inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter((x) => x !== id));
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
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  const showInput = !single || value.length === 0;

  return (
    <div className="assignee-tag-picker project-picker">
      <div
        className="assignee-tag-input"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((p) => (
          <span key={p.id} className="assignee-tag project-tag" title={p.title}>
            <span className="assignee-tag-name">{p.title}</span>
            <span className="project-tag-team">{teamName(p.workspaceId)}</span>
            <button
              type="button"
              className="assignee-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                remove(p.id);
              }}
              aria-label={`Unlink ${p.title}`}
              tabIndex={-1}
            >
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        {dangling.map((id) => (
          <span key={id} className="assignee-tag project-tag dangling">
            <span className="assignee-tag-name">Project no longer exists</span>
            <button
              type="button"
              className="assignee-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                remove(id);
              }}
              aria-label="Clear"
              tabIndex={-1}
            >
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        {showInput && (
          <input
            ref={inputRef}
            className="assignee-tag-text"
            type="text"
            value={query}
            placeholder={value.length === 0 ? placeholder : single ? "" : "Add another…"}
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
      {open && showInput && suggestions.length > 0 && (
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

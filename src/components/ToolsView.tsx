import { useEffect, useMemo, useState } from "react";
import type { Tool } from "../types";
import { Icon, type IconName, type IconTone } from "./Icon";
import { hostOf, normaliseUrl } from "../tools";

type Props = {
  tools: Tool[];
  currentDesignerId: string;
  currentDesignerName: string;
  onSave: (tool: Tool) => void;
  onDelete: (id: string) => void;
};

function newToolId(): string {
  return `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// The glyphs offered in the picker — a spread that covers the kinds of
// shortcuts a marketing team keeps: a brand portal, an asset library, an
// internal app, a dashboard, a calendar, a doc.
const TOOL_ICONS: IconName[] = [
  "link",
  "globe",
  "browser",
  "monitor",
  "laptop-code",
  "code",
  "book",
  "file",
  "folder",
  "email",
  "calendar",
  "video-camera",
  "clapperboard",
  "presentation-board-chart-graph",
  "pie-chart",
  "graph-chart",
  "target",
  "rocket",
  "store",
  "box-package",
  "award",
  "lightbulb",
  "settings",
];

const TOOL_TONES: IconTone[] = ["sky", "violet", "peach", "mint", "lime", "pale"];

// The team's shared shortcuts, as a wall of tiles. Anyone can add one, so the
// grid ends with an "Add a tool" tile; each existing tile opens its link in a
// new tab and carries hover actions to edit or remove it.
export function ToolsView({
  tools,
  currentDesignerId,
  currentDesignerName,
  onSave,
  onDelete,
}: Props) {
  // null = closed, "new" = adding, otherwise the tool being edited.
  const [editing, setEditing] = useState<Tool | "new" | null>(null);

  const sorted = useMemo(
    () => [...tools].sort((a, b) => a.name.localeCompare(b.name)),
    [tools],
  );

  return (
    <section className="workspace-section tools-section">
      <div className="section-head">
        <h2>Tools</h2>
        <span className="muted small">
          Shortcuts the whole team uses. Add one that's useful for everyone —
          a portal, an asset library, an internal app, a dashboard.
        </span>
      </div>

      <div className="tools-grid">
        {sorted.map((tool) => (
          <div key={tool.id} className="tool-tile">
            <a
              className="tool-open"
              href={normaliseUrl(tool.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon
                name={tool.icon ?? "link"}
                size={20}
                container="tile"
                tone={tool.tone ?? "sky"}
              />
              <span className="tool-body">
                <span className="tool-name">
                  {tool.name}
                  <Icon name="external-link" size={13} className="tool-ext" />
                </span>
                {tool.description && (
                  <span className="tool-desc">{tool.description}</span>
                )}
                <span className="tool-host">{hostOf(tool.url)}</span>
              </span>
            </a>
            <div className="tool-actions">
              <button
                type="button"
                className="icon-btn"
                title="Edit"
                aria-label={`Edit ${tool.name}`}
                onClick={() => setEditing(tool)}
              >
                <Icon name="edit" size={15} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="tool-tile tool-add"
          onClick={() => setEditing("new")}
        >
          <span className="tool-add-plus">
            <Icon name="add-plus" size={22} />
          </span>
          <span className="tool-add-label">Add a tool</span>
        </button>
      </div>

      {editing && (
        <ToolModal
          tool={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={(tool) => {
            onSave(tool);
            setEditing(null);
          }}
          onDelete={(id) => {
            onDelete(id);
            setEditing(null);
          }}
          currentDesignerId={currentDesignerId}
          currentDesignerName={currentDesignerName}
        />
      )}
    </section>
  );
}

type ModalProps = {
  // null when adding.
  tool: Tool | null;
  currentDesignerId: string;
  currentDesignerName: string;
  onSave: (tool: Tool) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
};

function ToolModal({
  tool,
  currentDesignerId,
  currentDesignerName,
  onSave,
  onDelete,
  onCancel,
}: ModalProps) {
  const [name, setName] = useState(tool?.name ?? "");
  const [url, setUrl] = useState(tool?.url ?? "");
  const [description, setDescription] = useState(tool?.description ?? "");
  const [icon, setIcon] = useState<IconName>(tool?.icon ?? "link");
  const [tone, setTone] = useState<IconTone>(tool?.tone ?? "sky");
  const [armRemove, setArmRemove] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    if (!armRemove) return;
    const t = setTimeout(() => setArmRemove(false), 4000);
    return () => clearTimeout(t);
  }, [armRemove]);

  const valid = name.trim().length > 0 && url.trim().length > 0;

  function save() {
    if (!valid) return;
    const next: Tool = {
      id: tool?.id ?? newToolId(),
      name: name.trim(),
      url: normaliseUrl(url),
      description: description.trim() || undefined,
      icon,
      tone,
      createdById: tool?.createdById ?? currentDesignerId,
      createdByName: tool?.createdByName ?? currentDesignerName,
      createdAt: tool?.createdAt ?? new Date().toISOString(),
    };
    onSave(next);
  }

  function remove() {
    if (!tool) return;
    if (!armRemove) {
      setArmRemove(true);
      return;
    }
    onDelete(tool.id);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal tool-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static" id="tool-modal-title">
              {tool ? "Edit tool" : "Add a tool"}
            </h2>
            <div className="modal-sub">
              A shortcut everyone on the team can see and open.
            </div>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <div className="tool-preview">
            <Icon name={icon} size={20} container="tile" tone={tone} />
            <span className="tool-body">
              <span className="tool-name">{name.trim() || "Tool name"}</span>
              {description.trim() && (
                <span className="tool-desc">{description.trim()}</span>
              )}
              <span className="tool-host">{url.trim() ? hostOf(url) : "where it opens"}</span>
            </span>
          </div>

          <label className="field">
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brand portal, IntelligenceBank, Figma"
              maxLength={60}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) save();
              }}
            />
          </label>

          <label className="field">
            <span>Link</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) save();
              }}
            />
          </label>

          <label className="field">
            <span>Description <span className="muted">(optional)</span></span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A line on what it's for"
              maxLength={120}
            />
          </label>

          <div className="field">
            <span>Icon</span>
            <div className="tool-icon-picker">
              {TOOL_ICONS.map((n) => (
                <button
                  type="button"
                  key={n}
                  className={`tool-icon-opt ${icon === n ? "active" : ""}`}
                  aria-pressed={icon === n}
                  aria-label={n}
                  onClick={() => setIcon(n)}
                >
                  <Icon name={n} size={18} />
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Colour</span>
            <div className="tool-tone-picker">
              {TOOL_TONES.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`tool-tone-opt ${tone === t ? "active" : ""}`}
                  aria-pressed={tone === t}
                  aria-label={t}
                  onClick={() => setTone(t)}
                >
                  <Icon name={icon} size={16} container="tile" tone={t} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-foot">
          <div>
            {tool && (
              <button
                type="button"
                className={`btn btn-sm ${armRemove ? "btn-danger" : "btn-ghost"}`}
                onClick={remove}
              >
                <Icon name="trash" size={13} />{" "}
                {armRemove ? "Click again to remove" : "Remove"}
              </button>
            )}
          </div>
          <div className="tool-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={!valid}
            >
              {tool ? "Save changes" : "Add tool"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

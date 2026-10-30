import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

export type NewKind = "project" | "campaign" | "webinar" | "event" | "post";

type Props = {
  onPick: (kind: NewKind) => void;
  // "primary" is the page header's button; "nav" is the sidebar's, which
  // shrinks to a bare + when the sidebar is collapsed.
  variant: "primary" | "nav";
  collapsed?: boolean;
};

type Item = { kind: NewKind; label: string; hint: string; children?: Item[] };

const ITEMS: Item[] = [
  { kind: "project", label: "Project", hint: "A card on a team board" },
  {
    kind: "campaign",
    label: "Campaign",
    hint: "A dated run with milestones",
    // Hover or focus Campaign and this slides out beside it.
    children: [{ kind: "webinar", label: "Webinar", hint: "A campaign worked through the 2026 webinar kit, ready to brief" }],
  },
  { kind: "event", label: "Event", hint: "A trade show or conference" },
  { kind: "post", label: "Social post", hint: "A post on the Social calendar" },
];

// The one "+ New" button, in the sidebar and the page header: opens a small
// menu of the things you can create. An item with children (Campaign →
// Webinar) shows them in a flyout beside it on hover, focus or →. Closes on
// a pick, on Escape, or on a click anywhere else.
export function NewMenu({ onPick, variant, collapsed }: Props) {
  const [open, setOpen] = useState(false);
  const [flyout, setFlyout] = useState<NewKind | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setFlyout(null);
  }

  function pick(kind: NewKind) {
    close();
    onPick(kind);
  }

  // The header's menu hangs off the right edge of the page, so its flyout
  // opens to the left; the sidebar's opens to the right.
  const side = variant === "primary" ? "left" : "right";

  return (
    <div ref={root} className={`new-menu new-menu-${variant}`}>
      <button
        type="button"
        className={variant === "nav" ? "nav-primary" : "primary"}
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="New project, campaign, webinar, event or social post"
      >
        {variant === "nav" && collapsed ? "+" : "+ New"}
      </button>
      {open && (
        <ul id={menuId} className="new-menu-list" role="menu">
          {ITEMS.map((item) => (
            <li
              key={item.kind}
              role="none"
              className={`new-menu-li ${item.children ? "has-children" : ""} ${flyout === item.kind ? "flyout-open" : ""}`}
              onMouseEnter={() => setFlyout(item.children ? item.kind : null)}
            >
              <button
                type="button"
                role="menuitem"
                className="new-menu-item"
                aria-haspopup={item.children ? "menu" : undefined}
                aria-expanded={item.children ? flyout === item.kind : undefined}
                onClick={() => pick(item.kind)}
                onFocus={() => setFlyout(item.children ? item.kind : null)}
                onKeyDown={(e) => {
                  if (item.children && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
                    e.preventDefault();
                    setFlyout(item.kind);
                    const first = root.current?.querySelector<HTMLButtonElement>(`[data-flyout="${item.kind}"] button`);
                    first?.focus();
                  }
                }}
              >
                <span className="new-menu-label">
                  {item.label}
                  {item.children && <Icon name={side === "left" ? "chevron-left" : "chevron-right"} size={14} className="new-menu-caret" />}
                </span>
                <span className="new-menu-hint">{item.hint}</span>
              </button>
              {item.children && flyout === item.kind && (
                <ul className={`new-menu-list new-menu-flyout flyout-${side}`} role="menu" data-flyout={item.kind} aria-label={`${item.label} options`}>
                  {item.children.map((child) => (
                    <li key={child.kind} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="new-menu-item"
                        onClick={() => pick(child.kind)}
                        onKeyDown={(e) => {
                          if (e.key === (side === "left" ? "ArrowRight" : "ArrowLeft")) {
                            e.preventDefault();
                            root.current?.querySelector<HTMLButtonElement>(`.new-menu-li.has-children > button`)?.focus();
                          }
                        }}
                      >
                        <span className="new-menu-label">{child.label}</span>
                        <span className="new-menu-hint">{child.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

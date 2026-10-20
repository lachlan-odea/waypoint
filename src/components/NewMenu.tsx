import { useEffect, useId, useRef, useState } from "react";

export type NewKind = "project" | "campaign" | "post";

type Props = {
  onPick: (kind: NewKind) => void;
  // "primary" is the page header's button; "nav" is the sidebar's, which
  // shrinks to a bare + when the sidebar is collapsed.
  variant: "primary" | "nav";
  collapsed?: boolean;
};

const ITEMS: { kind: NewKind; label: string; hint: string }[] = [
  { kind: "project", label: "Project", hint: "A card on a team board" },
  { kind: "campaign", label: "Campaign", hint: "A dated run with milestones" },
  { kind: "post", label: "Social post", hint: "A post on the Social calendar" },
];

// The one "+ New" button, in the sidebar and the page header: opens a small
// menu of the three things you can create. Closes on a pick, on Escape, or
// on a click anywhere else.
export function NewMenu({ onPick, variant, collapsed }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(kind: NewKind) {
    setOpen(false);
    onPick(kind);
  }

  return (
    <div ref={root} className={`new-menu new-menu-${variant}`}>
      <button
        type="button"
        className={variant === "nav" ? "nav-primary" : "primary"}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="New project, campaign or social post"
      >
        {variant === "nav" && collapsed ? "+" : "+ New"}
      </button>
      {open && (
        <ul id={menuId} className="new-menu-list" role="menu">
          {ITEMS.map((item) => (
            <li key={item.kind} role="none">
              <button
                type="button"
                role="menuitem"
                className="new-menu-item"
                onClick={() => pick(item.kind)}
              >
                <span className="new-menu-label">{item.label}</span>
                <span className="new-menu-hint">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

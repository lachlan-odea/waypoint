import type { ReactNode } from "react";
import type { ItemKind } from "../../router";
import { Icon } from "../Icon";

// The shell every full-page item (project, campaign, event) renders into,
// in the order the eye reads it: breadcrumbs, a header band with the name
// and the countdown, the tabs, the stage strip, then the body. The body is
// usually an ItemGrid: the main column plus two stacked side columns.
//
// All presentation; the pages own their data and callbacks.

export type Crumb = { label: string; onClick?: () => void };

export type PageTab = { id: string; label: string; count?: number };

export type StripState = "done" | "open" | "late" | "current" | "na";

export type StripCell = {
  key: string;
  // The small mono number or date in the cell's corner.
  n: string;
  label: string;
  // What sits under the label: a date, "No date", "Today".
  detail?: string;
  state: StripState;
  // The cell for the tab or stage being viewed.
  active?: boolean;
  title?: string;
  onClick?: () => void;
};

export type Fact = { label: string; value: ReactNode };

type Props = {
  kind: ItemKind;
  crumbs: Crumb[];
  eyebrow: ReactNode;
  title: string;
  subtitle?: ReactNode;
  countdown: { value: string; label: string };
  chips?: ReactNode;
  facts: Fact[];
  // Buttons for the right of the facts row: open on SharePoint, copy link…
  actions?: ReactNode;
  tabs: PageTab[];
  tab: string;
  onTab: (id: string) => void;
  strip?: StripCell[];
  stripLabel?: string;
  children: ReactNode;
};

export function ItemPage({
  kind,
  crumbs,
  eyebrow,
  title,
  subtitle,
  countdown,
  chips,
  facts,
  actions,
  tabs,
  tab,
  onTab,
  strip,
  stripLabel,
  children,
}: Props) {
  return (
    <div className={`item-page item-${kind}`}>
      <nav className="item-crumbs" aria-label="Where you are">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="item-crumb">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.onClick ? (
              <button type="button" className="link-btn" onClick={c.onClick}>
                {c.label}
              </button>
            ) : (
              <span className="item-crumb-here">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <header className="item-band">
        <div className="item-band-main">
          <div className="eyebrow item-band-eyebrow">{eyebrow}</div>
          <h1 className="item-band-title">{title}</h1>
          {subtitle && <p className="item-band-sub">{subtitle}</p>}
        </div>
        <div className="item-band-meta">
          <div className="item-countdown" aria-label={`${countdown.label}: ${countdown.value}`}>
            <span className="item-countdown-value">{countdown.value}</span>
            <small>{countdown.label}</small>
          </div>
          {chips && <div className="item-chips">{chips}</div>}
        </div>
        <dl className="item-facts">
          {facts.map((f) => (
            <div key={f.label} className="item-fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
          {actions && <div className="item-band-actions">{actions}</div>}
        </dl>
      </header>

      <nav className="item-tabs" aria-label={`${kind} views`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`item-tab ${tab === t.id ? "active" : ""}`}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="item-tab-count">{t.count}</span>
            )}
          </button>
        ))}
      </nav>

      {strip && strip.length > 0 && (
        <div className="item-strip" role="list" aria-label={stripLabel ?? "Stages"}>
          {strip.map((cell) => {
            const Tag = cell.onClick ? "button" : "div";
            return (
              <Tag
                key={cell.key}
                type={cell.onClick ? "button" : undefined}
                role="listitem"
                className={`item-strip-cell st-${cell.state} ${cell.active ? "active" : ""}`}
                title={cell.title}
                aria-current={cell.active ? "step" : undefined}
                onClick={cell.onClick}
              >
                <span className="item-strip-n">
                  {cell.n}
                  {cell.state === "done" ? (
                    <Icon name="checkmark" size={12} className="item-strip-check" />
                  ) : (
                    <span className={`item-strip-dot st-${cell.state}`} aria-hidden="true" />
                  )}
                </span>
                <span className="item-strip-label">{cell.label}</span>
                {cell.detail && (
                  <span className={`item-strip-detail ${cell.state === "late" ? "late" : ""}`}>
                    {cell.detail}
                  </span>
                )}
                <span className="item-strip-bar" aria-hidden="true" />
              </Tag>
            );
          })}
        </div>
      )}

      <div className="item-body">{children}</div>
    </div>
  );
}

// Main column plus two stacked side columns. On narrow screens the side
// columns fall under the main one.
export function ItemGrid({
  main,
  sideTop,
  sideBottom,
}: {
  main: ReactNode;
  sideTop?: ReactNode;
  sideBottom?: ReactNode;
}) {
  return (
    <div className="item-grid">
      <div className="item-grid-main">{main}</div>
      {sideTop && <div className="item-grid-top">{sideTop}</div>}
      {sideBottom && <div className="item-grid-bottom">{sideBottom}</div>}
    </div>
  );
}

export function SideCard({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`item-card ${className ?? ""}`}>
      <div className="item-card-head">
        <h3>{title}</h3>
        {aside}
      </div>
      <div className="item-card-body">{children}</div>
    </section>
  );
}

// Label / value pairs down a card.
export function KeyValues({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="item-kvs">
      {rows.map((r) => (
        <div key={r.label} className="item-kv">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The "Ready when" checklist: what has to be true for the item to be
// complete, with how far along it is. `action` is shown once everything is
// ticked, for the button that marks the item done.
export function ReadyWhen({
  reqs,
  action,
}: {
  reqs: [label: string, done: boolean][];
  action?: ReactNode;
}) {
  const ok = reqs.filter((r) => r[1]).length;
  const pct = reqs.length ? Math.round((ok / reqs.length) * 100) : 0;
  return (
    <>
      <div className="item-progress">
        <span className="item-progress-bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="mono">{pct}%</span>
      </div>
      <ul className="item-reqs">
        {reqs.map(([label, done]) => (
          <li key={label} className={done ? "ok" : ""}>
            <span className="item-req-mark" aria-hidden="true">
              {done && <Icon name="checkmark" size={12} />}
            </span>
            <span>
              {label}
              <span className="sr-only">{done ? " (complete)" : " (to do)"}</span>
            </span>
          </li>
        ))}
      </ul>
      {ok === reqs.length && reqs.length > 0 && action}
    </>
  );
}

export function ReadyCount({ reqs }: { reqs: [string, boolean][] }) {
  const ok = reqs.filter((r) => r[1]).length;
  return (
    <span className={`item-counter ${ok === reqs.length ? "ok" : ""}`}>
      {ok} of {reqs.length}
    </span>
  );
}

// A status pill in the design system's eight states.
export type WpStatus =
  | "draft"
  | "planning"
  | "in-progress"
  | "review"
  | "scheduled"
  | "live"
  | "complete"
  | "blocked";

export function StatusChip({
  status,
  children,
  title,
}: {
  status: WpStatus;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`wp-status ${status}`} title={title}>
      {children}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="item-empty">{children}</p>;
}

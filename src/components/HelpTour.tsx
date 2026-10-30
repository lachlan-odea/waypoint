import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Icon } from "./Icon";

// A guided walk through the page you're on: each step spotlights one part
// of the page (the rest dims) and explains it in a card beside it. The page
// stays live underneath, so you can try the thing being described. Esc or
// Done closes; arrows and Enter move between steps.

export type TourStep = {
  // A CSS selector for the element to spotlight. Left out, or matching
  // nothing on this page, the step shows as a card in the middle.
  target?: string;
  title: string;
  body: string;
};

type Props = {
  title: string;
  steps: TourStep[];
  onClose: () => void;
};

type Box = { x: number; y: number; w: number; h: number };
const PAD = 8;
const CARD_W = 340;
const GAP = 14;

export function HelpTour({ title, steps, onClose }: Props) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;

  const measure = useCallback(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    const el = step.target ? (document.querySelector(step.target) as HTMLElement | null) : null;
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setBox(null);
      return;
    }
    setBox({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [step.target]);

  // Bring the target into view, then measure once it has settled.
  useLayoutEffect(() => {
    const el = step.target ? (document.querySelector(step.target) as HTMLElement | null) : null;
    if (el) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    measure();
    const t1 = window.setTimeout(measure, 180);
    const t2 = window.setTimeout(measure, 450);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step.target, measure]);

  useEffect(() => {
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [measure]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (last) onClose();
        else setI((n) => n + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setI((n) => Math.max(0, n - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, onClose]);

  // Where the card goes: under the target if there's room, else above, else
  // beside it; in the middle when there's no target.
  let cardStyle: React.CSSProperties;
  let arrow: "up" | "down" | "none" = "none";
  if (box) {
    const left = Math.max(12, Math.min(vw - CARD_W - 12, box.x + box.w / 2 - CARD_W / 2));
    const below = box.y + box.h + PAD + GAP;
    const roomBelow = vh - below > 220;
    if (roomBelow) {
      cardStyle = { left, top: below };
      arrow = "up";
    } else if (box.y - PAD - GAP > 220) {
      cardStyle = { left, bottom: vh - (box.y - PAD - GAP) };
      arrow = "down";
    } else {
      const side = box.x + box.w + PAD + GAP + CARD_W < vw ? box.x + box.w + PAD + GAP : Math.max(12, box.x - PAD - GAP - CARD_W);
      cardStyle = { left: side, top: Math.max(12, Math.min(vh - 260, box.y)) };
    }
  } else {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }

  const hole = box
    ? { x: box.x - PAD, y: box.y - PAD, w: box.w + PAD * 2, h: box.h + PAD * 2 }
    : null;

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-label={`${title}: how to use this page`}>
      <svg className="tour-scrim" width={vw} height={vh} aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width={vw} height={vh} fill="#fff" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="10" fill="#000" />}
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} fill="rgba(20, 30, 48, 0.55)" mask="url(#tour-mask)" />
        {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="10" fill="none" stroke="#371EE1" strokeWidth="2" />}
      </svg>
      <div className={`tour-card arrow-${arrow}`} style={cardStyle}>
        <div className="tour-card-head">
          <span className="eyebrow">
            {title} · Step {i + 1} of {steps.length}
          </span>
          <button type="button" className="icon-btn tour-close" onClick={onClose} aria-label="Close the tour">
            <Icon name="close" size={14} />
          </button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {step.target && !box && <p className="tour-note">This part isn't on screen right now, so here's the gist.</p>}
        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, n) => (
            <i key={n} className={n === i ? "on" : n < i ? "done" : ""} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Skip tour
          </button>
          <span className="tour-spacer" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>
            Back
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? onClose() : setI((n) => n + 1))}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

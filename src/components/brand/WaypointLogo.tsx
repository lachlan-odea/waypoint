import { MARK_BARS, WORDMARK } from "./wordmark";

// The Waypoint logo (design system §3): three staggered, fully rounded bars —
// a plan moving left to right, top to bottom, start to finish. The last bar,
// the destination, is the only coloured element. The wordmark is the
// outlined DM Sans Bold from the design system (wordmark.ts), on the last
// bar's baseline.
//
// Geometry matches components/brand/WaypointLogo.jsx in the design-system
// project exactly, so this and the SVGs in public/logos/ (from
// scripts/make-logos.mjs) are the same drawing. Only these four colourways
// exist. Never retype, recolour, reorder, stretch, rotate or square off the
// bars.

export type LogoColor = "blue" | "white" | "mono-blue" | "mono-white";
export type LogoVariant = "horizontal" | "stacked" | "mark";

export const LOGO_COLORWAYS: Record<LogoColor, { bar: string; dest: string; text: string }> = {
  blue: { bar: "#1D1765", dest: "#371EE1", text: "#1D1765" },
  white: { bar: "#FFFFFF", dest: "#B7B3FF", text: "#FFFFFF" },
  "mono-blue": { bar: "#1D1765", dest: "#1D1765", text: "#1D1765" },
  "mono-white": { bar: "#FFFFFF", dest: "#FFFFFF", text: "#FFFFFF" },
};

// The horizontal lockup's drawing box, shared with the login intro so the
// animated logo lands exactly on the static one.
export const HORIZONTAL_VIEWBOX = "4 6 256 46";
export const HORIZONTAL_RATIO = 256 / 46;

function Bars({ color }: { color: LogoColor }) {
  const c = LOGO_COLORWAYS[color];
  return (
    <>
      {MARK_BARS.map(([x, y, w], i) => (
        <rect key={i} x={x} y={y} width={w} height={8} rx={4} fill={i === 2 ? c.dest : c.bar} />
      ))}
    </>
  );
}

export function WaypointMark({
  size = 24,
  color = "blue",
  className,
  title = "Waypoint",
}: {
  size?: number;
  color?: LogoColor;
  className?: string;
  title?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title} className={className}>
      <title>{title}</title>
      <Bars color={color} />
    </svg>
  );
}

export function WaypointLogo({
  variant = "horizontal",
  color = "blue",
  height = 26,
  className,
  title = "Waypoint",
}: {
  variant?: LogoVariant;
  color?: LogoColor;
  // Rendered height in CSS pixels. Minimums per the spec: 20px horizontal,
  // 16px mark.
  height?: number;
  className?: string;
  title?: string;
}) {
  const c = LOGO_COLORWAYS[color];
  if (variant === "mark") {
    return <WaypointMark size={height} color={color} className={className} title={title} />;
  }
  if (variant === "stacked") {
    return (
      <svg
        viewBox="0 -2 204 110"
        height={height}
        width={(height * 204) / 110}
        role="img"
        aria-label={title}
        className={className}
      >
        <title>{title}</title>
        <g transform="translate(65.8 -12) scale(1.5)">
          <Bars color={color} />
        </g>
        <path transform={`translate(${-WORDMARK.lsb} 56)`} fill={c.text} d={WORDMARK.d} />
      </svg>
    );
  }
  return (
    <svg
      viewBox={HORIZONTAL_VIEWBOX}
      height={height}
      width={height * HORIZONTAL_RATIO}
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <Bars color={color} />
      <path transform={`translate(${56 - WORDMARK.lsb} 0)`} fill={c.text} d={WORDMARK.d} />
    </svg>
  );
}

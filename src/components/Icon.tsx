// Waypoint line icons (design system §7). 24×24 viewBox, 1.5px stroke,
// currentColor, round caps and joins. Drawn here in the WiseTech line style;
// we don't ship WiseTech's own icon paths, so these are faithful, simple
// approximations with the same names, and new UI should pick from this set
// rather than inventing a glyph. An unknown name renders a dashed
// placeholder and warns once, so a typo is visible rather than silent.

// A circle as path data, so every icon is a list of `d` strings.
function c(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

const PATHS = {
  // Work and navigation
  "chart-square": ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8 16v-4", "M12 16V8", "M16 16v-6"],
  target: [c(12, 12, 9), c(12, 12, 5.5), c(12, 12, 2)],
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  calendar: ["M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M3 10h18", "M8 3v4", "M16 3v4"],
  file: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5"],
  "pie-chart": ["M21 12A9 9 0 1 1 12 3v9z", "M12 3a9 9 0 0 1 9 9h-9z"],
  "group-user-people": [c(9, 8, 3.5), "M3 20a6 6 0 0 1 12 0", c(17, 9, 2.5), "M15.5 14.5a5 5 0 0 1 5.5 5"],
  "user-profile": [c(12, 8, 4), "M4 21a8 8 0 0 1 16 0"],
  search: [c(11, 11, 6.5), "M16 16l5 5"],
  "add-plus": ["M12 5v14", "M5 12h14"],
  checkmark: ["M5 12.5l4.5 4.5L19 7"],
  settings: [c(12, 12, 3), "M12 2.5v3", "M12 18.5v3", "M2.5 12h3", "M18.5 12h3", "M5.3 5.3l2.1 2.1", "M16.6 16.6l2.1 2.1", "M5.3 18.7l2.1-2.1", "M16.6 7.4l2.1-2.1"],
  clock: [c(12, 12, 9), "M12 7v5l3 2"],
  "clock-circle": [c(12, 12, 9), c(12, 12, 6), "M12 9v3h2.5"],
  email: ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M3 7l9 6 9-6"],
  "bell-notification": ["M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  "message-chat": ["M21 14a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"],
  phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
  rocket: ["M12 2c3 2 5 6 5 10l-2 4H9l-2-4c0-4 2-8 5-10z", "M9 16l-3 4", "M15 16l3 4", c(12, 9, 1.5)],
  "trending-up": ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
  "graph-chart": ["M3 3v18h18", "M7 15l4-5 3 3 5-7"],
  "presentation-board-chart-graph": ["M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M12 16v5", "M8 21h8", "M7 12l3-3 2 2 5-4"],
  lightbulb: ["M9 18h6", "M10 21h4", "M8.5 14.5a6 6 0 1 1 7 0c-.8.8-1.5 1.5-1.5 3.5h-4c0-2-.7-2.7-1.5-3.5z"],
  award: [c(12, 9, 6), "M8.5 14l-1.5 7 5-3 5 3-1.5-7"],
  trophy: ["M8 4h8v6a4 4 0 0 1-8 0z", "M8 6H5v2a3 3 0 0 0 3 3", "M16 6h3v2a3 3 0 0 1-3 3", "M12 14v4", "M8 21h8", "M9 18h6"],
  handshake: ["M3 11l4-4 5 1 4-1 5 4", "M12 8l-3 3a1.5 1.5 0 0 0 2 2l2-2 4 4a1.5 1.5 0 0 1-2 2", "M15 17a1.5 1.5 0 0 1-2 2", "M13 19a1.5 1.5 0 0 1-2 2L5 15"],
  heart: ["M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"],
  book: ["M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z", "M4 19a2 2 0 0 1 2-2h14", "M8 7h8"],
  "certificate-tick": [c(12, 12, 9), "M8 12.5l3 3 5-6"],
  lock: ["M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z", "M8 11V7a4 4 0 0 1 8 0v4", c(12, 16, 1)],
  "shield-tick-protect": ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", "M9 12l2 2 4-4"],
  browser: ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M3 9h18", "M6 7h.01", "M9 7h.01"],
  monitor: ["M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M8 21h8", "M12 16v5"],
  "video-camera": ["M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z", "M16 11l6-3v8l-6-3"],
  clapperboard: ["M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M4.5 10L3.8 6.6 19.5 4l.7 3.4z", "M8.4 5.9L7.7 9.5", "M12.9 5.1l-.7 3.6", "M17.3 4.4l-.7 3.5"],
  "laptop-code": ["M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10H4z", "M2 19h20", "M10 9l-2 2 2 2", "M14 9l2 2-2 2"],
  code: ["M8 8l-4 4 4 4", "M16 8l4 4-4 4", "M14 5l-4 14"],
  globe: [c(12, 12, 9), "M3 12h18", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18"],
  "globe-location-pin": [c(10, 12, 8), "M2 12h16", "M10 4a12 12 0 0 1 0 16", "M10 4a12 12 0 0 0 0 16", "M19 22s-3-2.7-3-5a3 3 0 0 1 6 0c0 2.3-3 5-3 5z", c(19, 17, 1)],
  map: ["M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z", "M9 4v14", "M15 6v14"],
  "map-path": [c(5, 18, 2.5), c(19, 6, 2.5), "M7.5 18h5a3.5 3.5 0 0 0 0-7h-2a2.5 2.5 0 0 1 0-5h6"],
  "location-pin": ["M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z", c(12, 11, 2)],
  tag: ["M3 12V4h8l10 10-8 8z", c(7.5, 8.5, 1)],
  store: ["M3 9l1.5-5h15L21 9", "M3 9a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0", "M5 11v9h14v-9", "M10 20v-5h4v5"],
  "cart-shopping": ["M3 4h2l2.5 11h11L21 7H6.2", c(9, 20, 1.5), c(17, 20, 1.5)],
  wallet: ["M5 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z", "M3 10h18", "M16 15h2", "M7 6V4h10v2"],
  coins: [c(9, 9, 6), "M14.6 11.5a6 6 0 1 1-6.1 6.1"],
  "dollar-sign": ["M12 3v18", "M16.5 7.5A3.5 3.5 0 0 0 13 5h-2a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2.5A3.5 3.5 0 0 1 7 14.5"],
  "receipt-invoice": ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6", "M9 12h6", "M9 16h4"],
  bank: ["M3 10l9-6 9 6H3z", "M5 10v8", "M9.5 10v8", "M14.5 10v8", "M19 10v8", "M3 21h18"],
  "box-package": ["M12 3l9 4.5v9L12 21l-9-4.5v-9z", "M3 7.5l9 4.5 9-4.5", "M12 12v9"],
  truck: ["M2 7h11v9H2z", "M13 10h4l3 3v3h-7", c(6, 18, 2), c(17, 18, 2)],
  plane: ["M2 14l8-1 4-7a2 2 0 0 1 3.5 2l-3 5 6 2-1 2-7-1-4 5H7l2-6-7-1z"],
  "boat-ship": ["M3 17c3 1 6 2 9 2s6-1 9-2l-2-4H5z", "M12 13V4", "M12 5l5 6H7z"],
  train: ["M8 3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z", "M5 11h14", "M9 21l1.5-4", "M15 21l-1.5-4", c(9, 14, 1), c(15, 14, 1)],
  warehouse: ["M3 21V9l9-5 9 5v12", "M7 21v-8h10v8", "M7 17h10"],
  "archive-documents-box-big": ["M4 4h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9", "M10 13h4"],
  printer: ["M7 8V3h10v5", "M5 8h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z", "M7 14h10v7H7z"],
  mouse: ["M12 3a5 5 0 0 1 5 5v8a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5z", "M12 7v3"],
  "router-internet-wifi": ["M5 14h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z", "M7 17h.01", "M11 17h.01", "M8.5 9.5a5 5 0 0 1 7 0", "M6 6.5a9 9 0 0 1 12 0", "M12 11v3"],
  "server-upload-download": ["M5 3h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M5 13h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z", "M7 6h.01", "M7 16h.01", "M15 7l2-2 2 2", "M15 15l2 2 2-2"],
  leaf: ["M20 4C10 4 4 10 4 20c10 0 16-6 16-16z", "M4 20L14 10"],
  car: ["M4 15l2-6h12l2 6v4H4z", "M4 15h16", c(7.5, 17.5, 1.5), c(16.5, 17.5, 1.5)],
  // Utility
  close: ["M6 6l12 12", "M18 6L6 18"],
  "chevron-left": ["M15 6l-6 6 6 6"],
  "chevron-right": ["M9 6l6 6-6 6"],
  "chevron-down": ["M6 9l6 6 6-6"],
  "external-link": ["M14 4h6v6", "M20 4l-9 9", "M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  download: ["M12 4v12", "M7 11l5 5 5-5", "M4 20h16"],
  upload: ["M12 16V4", "M7 9l5-5 5 5", "M4 20h16"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"],
  flag: ["M5 21V4h11l-2 4 2 4H5"],
  "log-out": ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
} as const;

export type IconName = keyof typeof PATHS;
// eslint-disable-next-line react-refresh/only-export-components -- the name list is part of the icon API
export const ICON_NAMES = Object.keys(PATHS) as readonly IconName[];

export type IconTone = "sky" | "pale" | "violet" | "peach" | "mint" | "lime";

type Props = {
  name: IconName | string;
  size?: number;
  // "tile" wraps the glyph in a rounded square filled with `tone`; the glyph
  // is then always WiseTech Blue (light accents carry dark ink).
  container?: "none" | "tile";
  tone?: IconTone;
  // Glyph colour. Defaults to currentColor (or WiseTech Blue in a tile).
  color?: string;
  className?: string;
  // Accessible name. Without one the icon is decorative (aria-hidden).
  title?: string;
};

const warned = new Set<string>();

export function Icon({
  name,
  size = 20,
  container = "none",
  tone = "sky",
  color,
  className,
  title,
}: Props) {
  const d = (PATHS as Record<string, readonly string[]>)[name];
  if (!d) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`Icon "${name}" is not in the Waypoint icon set.`);
    }
    return (
      <span
        className={`icon-missing ${className ?? ""}`}
        style={{ width: size, height: size, lineHeight: `${size}px` }}
        title={title ?? `Unknown icon: ${name}`}
        aria-hidden={title ? undefined : true}
      >
        ?
      </span>
    );
  }
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={container === "none" ? className : undefined}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {d.map((path, i) => (
        <path key={i} d={path} />
      ))}
    </svg>
  );
  if (container === "tile") {
    const box = Math.round(size * 1.9);
    return (
      <span
        className={`icon-tile tone-${tone} ${className ?? ""}`}
        style={{ width: box, height: box, color: color ?? "#1D1765" }}
      >
        {svg}
      </span>
    );
  }
  return svg;
}

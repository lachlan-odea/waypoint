// Text colour for a label sitting on a solid, data-driven colour: avatar
// initials on a person's colour, a channel or priority chip. White unless it
// would fall below WCAG AA (4.5:1) on that colour, then the darkest ink.
// Works in both themes, since the chip keeps its own colour either way.

const DARK_INK = "#0E1726";

function luminance(hex: string): number | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableTextOn(background: string | undefined): string {
  const l = background ? luminance(background) : null;
  if (l === null) return "#FFFFFF";
  // Contrast of white on the colour: (1 + 0.05) / (l + 0.05).
  return 1.05 / (l + 0.05) >= 4.5 ? "#FFFFFF" : DARK_INK;
}

// Inline style for a solid chip: the colour plus readable text on it.
export function chipStyle(background: string): { background: string; color: string } {
  return { background, color: readableTextOn(background) };
}

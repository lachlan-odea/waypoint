// Writes the Waypoint logo lockups to public/logos/ from the same geometry
// as src/components/brand/WaypointLogo.tsx (design system §3).
//
//   node scripts/make-logos.mjs
//
// Files: waypoint-{mark|horizontal|stacked}-{blue|white|mono-blue|mono-white}.svg
// and waypoint-app-icon.svg. The wordmark is SVG <text> in DM Sans rather
// than outlines (no font outlining at build time), so a viewer without DM
// Sans falls back to its system sans. The mark itself needs no font.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "logos");
mkdirSync(out, { recursive: true });

const COLORWAYS = {
  blue: { main: "#1D1765", destination: "#371EE1" },
  white: { main: "#FFFFFF", destination: "#B7B3FF" },
  "mono-blue": { main: "#1D1765", destination: "#1D1765" },
  "mono-white": { main: "#FFFFFF", destination: "#FFFFFF" },
};
const BARS = [
  { x: 5, y: 8, w: 22 },
  { x: 13, y: 20, w: 24 },
  { x: 23, y: 32, w: 20 },
];
const FONT = "'DM Sans', ui-sans-serif, system-ui, sans-serif";
const WORD_FONT = 45.7;
const WORD_WIDTH = 194;
const GAP = 12;

function bars(cw, dx = 0, dy = 0) {
  return BARS.map(
    (b, i) =>
      `<rect x="${b.x + dx}" y="${b.y + dy}" width="${b.w}" height="8" rx="4" fill="${
        i === BARS.length - 1 ? cw.destination : cw.main
      }"/>`,
  ).join("");
}
const text = (x, y, size, fill, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="700" font-size="${size}" letter-spacing="-0.03em" fill="${fill}"${
    anchor === "middle" ? ' text-anchor="middle"' : ""
  }>Waypoint</text>`;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Waypoint"><title>Waypoint</title>${body}</svg>\n`;

for (const [name, cw] of Object.entries(COLORWAYS)) {
  writeFileSync(join(out, `waypoint-mark-${name}.svg`), svg(48, 48, bars(cw)));
  const hw = 48 + GAP + WORD_WIDTH + 6;
  writeFileSync(
    join(out, `waypoint-horizontal-${name}.svg`),
    svg(hw, 48, bars(cw) + text(48 + GAP, 40, WORD_FONT, cw.main)),
  );
  writeFileSync(
    join(out, `waypoint-stacked-${name}.svg`),
    svg(200, 100, bars(cw, (200 - 48) / 2, 0) + text(100, 88, 34.3, cw.main, "middle")),
  );
}

// App icon: WiseTech Blue square, white bars, Violet destination, mark at
// ~60% of the square. Supply square art; the OS applies its mask.
const S = 512;
const scale = (S * 0.6) / 48;
const offset = (S - 48 * scale) / 2;
writeFileSync(
  join(out, "waypoint-app-icon.svg"),
  svg(
    S,
    S,
    `<rect width="${S}" height="${S}" rx="96" fill="#1D1765"/><g transform="translate(${offset} ${offset}) scale(${scale})">${bars(
      COLORWAYS.white,
    )}</g>`,
  ),
);
console.log(`Wrote ${4 * 3 + 1} logo files to ${out}`);

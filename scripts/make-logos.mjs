// Writes the Waypoint logo lockups to public/logos/ from the same geometry
// as src/components/brand/WaypointLogo.tsx (design system §3), with the
// outlined wordmark from src/components/brand/wordmark.ts.
//
//   node scripts/make-logos.mjs
//
// Files: waypoint-{mark|horizontal|stacked}-{blue|white|mono-blue|mono-white}.svg
// and waypoint-app-icon.svg.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "logos");
mkdirSync(out, { recursive: true });

// Read the wordmark straight out of the TypeScript source so the two can't
// drift: the path is the first `d: "…"` string, the bearing the `lsb:` value.
const src = readFileSync(join(root, "src", "components", "brand", "wordmark.ts"), "utf8");
const d = src.match(/d:\s*"([^"]+)"/)[1];
const lsb = Number(src.match(/lsb:\s*([\d.]+)/)[1]);

const COLORWAYS = {
  blue: { bar: "#1D1765", dest: "#371EE1", text: "#1D1765" },
  white: { bar: "#FFFFFF", dest: "#B7B3FF", text: "#FFFFFF" },
  "mono-blue": { bar: "#1D1765", dest: "#1D1765", text: "#1D1765" },
  "mono-white": { bar: "#FFFFFF", dest: "#FFFFFF", text: "#FFFFFF" },
};
const BARS = [
  [5, 8, 22],
  [13, 20, 24],
  [23, 32, 20],
];

const bars = (c) =>
  BARS.map(([x, y, w], i) => `<rect x="${x}" y="${y}" width="${w}" height="8" rx="4" fill="${i === 2 ? c.dest : c.bar}"/>`).join("");
const word = (c, tx, ty) => `<path transform="translate(${tx} ${ty})" fill="${c.text}" d="${d}"/>`;
const svg = (viewBox, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Waypoint"><title>Waypoint</title>${body}</svg>\n`;

for (const [name, c] of Object.entries(COLORWAYS)) {
  writeFileSync(join(out, `waypoint-mark-${name}.svg`), svg("0 0 48 48", bars(c)));
  writeFileSync(join(out, `waypoint-horizontal-${name}.svg`), svg("4 6 256 46", bars(c) + word(c, 56 - lsb, 0)));
  writeFileSync(
    join(out, `waypoint-stacked-${name}.svg`),
    svg("0 -2 204 110", `<g transform="translate(65.8 -12) scale(1.5)">${bars(c)}</g>` + word(c, -lsb, 56)),
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
    `0 0 ${S} ${S}`,
    `<rect width="${S}" height="${S}" rx="96" fill="#1D1765"/><g transform="translate(${offset} ${offset}) scale(${scale})">${bars(COLORWAYS.white)}</g>`,
  ),
);
console.log(`Wrote ${4 * 3 + 1} logo files to ${out}`);

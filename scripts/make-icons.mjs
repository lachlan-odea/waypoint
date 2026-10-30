// Rasterises the Waypoint app icon to the PNGs the browser, the installed
// app and desktop notifications use, from the same geometry as
// scripts/make-logos.mjs (design system §3). No image library: the icon
// is a rounded square and three rounded bars, so coverage is computed
// per pixel with 4×4 supersampling and written as RGBA PNG.
//
//   node scripts/make-icons.mjs
//
// Files (public/):
//   app-icon.png           512  rounded square, transparent corners  manifest "any", desktop alerts
//   app-icon-maskable.png  512  full bleed, mark in the safe zone     manifest "maskable"
//   apple-touch-icon.png   180  full bleed (iOS applies its own mask)
//   favicon.png             64  rounded square                       tab icon fallback
//   hero.png               376  rounded square                       profile set-up screen
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BLUE = [0x1d, 0x17, 0x65];
const WHITE = [0xff, 0xff, 0xff];
const VIOLET = [0xb7, 0xb3, 0xff];
// x, y, width in the 48-unit mark; every bar is 8 tall with fully round ends.
const BARS = [
  [5, 8, 22, WHITE],
  [13, 20, 24, WHITE],
  [23, 32, 20, VIOLET],
];
const SS = 4; // samples per axis per pixel

// Signed distance to a rounded rectangle; negative inside.
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function render(size, { rounded }) {
  const radius = rounded ? size * (96 / 512) : 0;
  const scale = (size * 0.6) / 48;
  const offset = (size - 48 * scale) / 2;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
          if (rounded && sdRoundRect(fx, fy, 0, 0, size, size, radius) > 0) continue;
          let c = BLUE;
          for (const [bx, by, bw, col] of BARS) {
            if (sdRoundRect(fx, fy, offset + bx * scale, offset + by * scale, bw * scale, 8 * scale, 4 * scale) <= 0) { c = col; break; }
          }
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (a) { px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a); }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, size, px);
}

// ── Minimal PNG encoder: 8-bit RGBA, filter 0, one IDAT ─────────────────
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const FILES = [
  ["app-icon.png", 512, { rounded: true }],
  ["app-icon-maskable.png", 512, { rounded: false }],
  ["apple-touch-icon.png", 180, { rounded: false }],
  ["favicon.png", 64, { rounded: true }],
  ["hero.png", 376, { rounded: true }],
];
for (const [name, size, opts] of FILES) {
  const buf = render(size, opts);
  writeFileSync(join(out, name), buf);
  console.log(`${name.padEnd(24)} ${size}×${size}  ${buf.length} bytes`);
}

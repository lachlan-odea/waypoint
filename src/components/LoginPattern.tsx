// The brand "field" background behind the login and profile-setup cards: a
// grid of short Violet strokes on navy that turn from upright at the top to
// flat at the bottom, with the rows drawing closer together as they go down.
// Geometry is measured off the brand asset (1561 × 1201) so it matches when
// laid side by side; the SVG is scaled to cover whatever the viewport is.

const WIDTH = 1561;
const HEIGHT = 1201;
const COLS = 19;
const ROWS = 20;
const COL_START = 50;
const COL_STEP = 81.2;
const ROW_START = 50;
// Each row gap is a little tighter than the one above it.
const FIRST_GAP = 82;
const GAP_SHRINK = 2.55;

type Stroke = { x1: number; y1: number; x2: number; y2: number };

function buildStrokes(): Stroke[] {
  const strokes: Stroke[] = [];
  let y = ROW_START;
  for (let row = 0; row < ROWS; row++) {
    // Half-extents: 42px tall and upright on the first row, 60px wide and
    // flat on the last, leaning like "/" in between.
    const hx = 1.5 * row + 0.5;
    const hy = Math.max(0, 21 - 1.1 * row);
    for (let col = 0; col < COLS; col++) {
      const x = COL_START + COL_STEP * col;
      strokes.push({ x1: x - hx, y1: y + hy, x2: x + hx, y2: y - hy });
    }
    y += FIRST_GAP - GAP_SHRINK * row;
  }
  return strokes;
}

const STROKES = buildStrokes();

export function LoginPattern() {
  return (
    <svg
      className="login-pattern"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth={3.2}>
        {STROKES.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        ))}
      </g>
    </svg>
  );
}

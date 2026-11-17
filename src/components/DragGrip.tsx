// The six-dot handle a row is dragged by, shared by project tasks and the
// My Desk To Do list. Styled by `.item-task-grip` in pages.css; the reorder
// helpers are in src/dragReorder.ts.
export function GripDots() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
      {[3, 8, 13].flatMap((y) => [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
    </svg>
  );
}

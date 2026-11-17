// Drag-to-reorder helpers shared by project tasks and the My Desk To Do list.
// The grip itself is GripDots in src/components/DragGrip.tsx.

// Which half of a row the pointer is over during a drag: the dragged item
// lands above the row ("before") or below it ("after").
export function dropPosition(e: React.DragEvent<HTMLElement>): "before" | "after" {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

// Move `fromId` next to `toId`, returning the new order of ids.
export function reorderIds(ids: string[], fromId: string, toId: string, position: "before" | "after"): string[] {
  if (fromId === toId) return ids;
  const next = ids.filter((id) => id !== fromId);
  const to = next.indexOf(toId);
  if (to < 0 || !ids.includes(fromId)) return ids;
  next.splice(position === "after" ? to + 1 : to, 0, fromId);
  return next;
}

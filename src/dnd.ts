export const DRAG_MIME = "application/x-pmtool-project-id";

export function readDraggedProjectId(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain") || null;
}

export function writeDraggedProjectId(e: React.DragEvent, id: string) {
  e.dataTransfer.setData(DRAG_MIME, id);
  e.dataTransfer.setData("text/plain", id);
  e.dataTransfer.effectAllowed = "move";
}

import type { Suggestion, SuggestionKind, SuggestionStatus } from "./types";

// Labels and helpers for the suggestions sent from Settings → Suggest a
// feature, shared by the form, the super-user review list and Settings.
// Keep SUGGESTION_KIND_LABELS in step with the copy in
// functions/src/index.ts (notifySuggestion).
export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  feature: "New feature",
  improvement: "Improvement",
  bug: "Bug",
};

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: "New",
  planned: "Planned",
  done: "Done",
  declined: "Declined",
};

export const SUGGESTION_STATUS_ORDER: SuggestionStatus[] = ["new", "planned", "done", "declined"];

// Open means still wanting a decision or a build: new or planned.
export function isOpenSuggestion(s: Suggestion): boolean {
  return s.status === "new" || s.status === "planned";
}

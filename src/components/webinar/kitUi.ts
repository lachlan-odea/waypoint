import type { KitSectionStatus } from "../../types";
import { ROLES, type SectionSpec } from "../../webinarKit";
import type { WpStatus } from "../pages/ItemPage";

// Small shared helpers for the kit components, kept out of the component
// files so those export only components (fast refresh).

export const KIT_STATUS_CHIP: Record<KitSectionStatus, WpStatus> = {
  todo: "draft",
  doing: "in-progress",
  review: "review",
  done: "complete",
  blocked: "blocked",
  na: "draft",
};

export function whoLine(s: SectionSpec): string {
  const withs = s.with.map((r) => ROLES[r].label);
  const joined = withs.length ? ` with ${withs.join(", ").replace(/, ([^,]*)$/, " and $1")}` : "";
  return `Completed by ${ROLES[s.owner].label}${joined} · ${s.timing}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

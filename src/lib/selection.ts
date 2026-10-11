import type { Selection } from "@/lib/database.types";

/**
 * Hearts include stars; stars do not include hearts.
 *
 * A star is "one of the strongest", so anything worth hearting is already
 * covered by it: viewing Hearts shows hearts AND stars, viewing Stars shows
 * only stars. The stored value is never changed — a starred frame is still
 * just 'star'; this only widens what a Hearts filter matches.
 */
export function selectionsMatchedBy(filter: Selection[]): Selection[] {
  return filter.includes("heart") ? ["heart", "star"] : [...filter];
}

/** True when a frame with this mark passes the given Hearts/Stars filter (an empty filter passes everything). */
export function passesSelectionFilter(mark: Selection | null, filter: Selection[]): boolean {
  if (filter.length === 0) return true;
  return mark !== null && selectionsMatchedBy(filter).includes(mark);
}

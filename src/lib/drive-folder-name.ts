import { formatShortDate } from "@/lib/date";

/**
 * The Drive folder name for a roll, e.g. `9.28_10.2_JHCStreetPan_ATX`:
 *
 *   START_END _ FILMSTOCK [_ LOCATIONS]
 *
 * - Dates are month.day with no leading zeros; a one-day roll shows one date.
 * - The film stock and each location are squashed to letters and digits, so
 *   "JHC Street Pan" becomes "JHCStreetPan" and there are no spaces or
 *   punctuation in the folder name.
 * - Several locations are joined with "-" in the order first shot; a roll with
 *   no locations simply leaves that part out.
 * - The year is not in the name: the year folder above it carries it.
 * Derived from structured fields at creation time and never stored as the only
 * record of anything; the roll's display title is unchanged.
 */
export function squash(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, "");
}

export function generateDriveFolderName(params: {
  startDate: string;
  endDate: string | null;
  filmStockName: string;
  locationNames: string[];
}): string {
  const start = formatShortDate(params.startDate);
  const end = params.endDate ? formatShortDate(params.endDate) : start;
  const dates = end === start ? start : `${start}_${end}`;

  const seen = new Set<string>();
  const locations: string[] = [];
  for (const name of params.locationNames) {
    const s = squash(name);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      locations.push(s);
    }
  }

  return [dates, squash(params.filmStockName), locations.join("-")].filter(Boolean).join("_");
}

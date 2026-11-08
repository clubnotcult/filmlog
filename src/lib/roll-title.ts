import { formatShortDateRange } from "@/lib/date";

/**
 * Generates the displayed roll title from structured fields (spec §6).
 *
 * Format: `START DATE[–END DATE] · FILM STOCK[ · CUSTOM TITLE]` — a roll that
 * started and finished on the same day shows its date once ("11.6").
 *
 * The generated string is a *display* value only — start_date, end_date,
 * film_stock and custom_title remain the structured source of truth in the
 * database. Never persist this string as the only record of the title.
 */
export function generateRollTitle(params: {
  startDate: string;
  endDate: string | null;
  filmStockName: string;
  customTitle: string | null;
}): string {
  const { startDate, endDate, filmStockName, customTitle } = params;

  const dateRange = formatShortDateRange(startDate, endDate);

  const parts = [dateRange, filmStockName];
  if (customTitle && customTitle.trim().length > 0) {
    parts.push(customTitle.trim());
  }

  return parts.join(" · ");
}

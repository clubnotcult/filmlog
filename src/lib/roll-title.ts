import { formatShortDate } from "@/lib/date";

/**
 * Generates the displayed roll title from structured fields (spec §6).
 *
 * Format: `START DATE[–END DATE] · FILM STOCK[ · CUSTOM TITLE]`
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

  const dateRange = endDate
    ? `${formatShortDate(startDate)}–${formatShortDate(endDate)}`
    : formatShortDate(startDate);

  const parts = [dateRange, filmStockName];
  if (customTitle && customTitle.trim().length > 0) {
    parts.push(customTitle.trim());
  }

  return parts.join(" · ");
}

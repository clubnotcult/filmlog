/**
 * Postgres `date` columns come back from Supabase as plain "YYYY-MM-DD"
 * strings. Parsing those with `new Date(...)` applies the browser/server's
 * local timezone and can shift the date by a day. Everything here works on
 * the string directly instead.
 */

/** Formats "2026-09-10" as "9.10" (month.day, no leading zeros). */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}.${Number(day)}`;
}

/** Formats "2026-09-10" as "Sep 10, 2026" for detail views. */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today as "YYYY-MM-DD" in the browser's local timezone, for date inputs. */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ExpirationUrgency = "expired" | "soon" | "normal";

/** "expired" once past, "soon" within 90 days, otherwise "normal" — purely for a subtle color cue, never blocking any action. */
export function expirationUrgency(isoDate: string): ExpirationUrgency {
  const today = todayIsoDate();
  if (isoDate < today) return "expired";
  const [y, m, d] = isoDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const daysUntil = (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000;
  return daysUntil <= 90 ? "soon" : "normal";
}

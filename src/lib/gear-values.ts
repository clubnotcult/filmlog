/**
 * Cameras and lenses store their selectable values as ordered lists
 * (spec §3). These parse the comma-separated text inputs used in the gear
 * forms into that structured form, preserving the order the user typed.
 */

/** "B, 1, 1/2, 1/4, 1/125" -> ["B", "1", "1/2", "1/4", "1/125"] */
export function parseShutterSpeeds(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function formatShutterSpeeds(values: string[]): string {
  return values.join(", ");
}

/** "f/1.4, f/2, 2.8, 4" -> [1.4, 2, 2.8, 4] */
export function parseApertureStops(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^f\//i, ""))
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n > 0);
}

export function formatApertureStops(values: number[]): string {
  return values.map((v) => `f/${v}`).join(", ");
}

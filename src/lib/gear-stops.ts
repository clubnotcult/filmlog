export type StopIncrement = "full" | "half" | "third";

export const STOP_INCREMENT_LABELS: Record<StopIncrement, string> = {
  full: "Full stops",
  half: "Half stops",
  third: "Third stops",
};

/**
 * Standard ISO-recognized aperture sequences. Full stops are the classic
 * f/1.4, f/2, f/2.8… progression; half and third stop sequences are the
 * same industry-standard values printed on real lens aperture rings and
 * used in camera manuals — not invented for this app.
 */
const APERTURE_FULL = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32, 45, 64];
const APERTURE_HALF = [
  1, 1.2, 1.4, 1.7, 2, 2.4, 2.8, 3.3, 4, 4.8, 5.6, 6.7, 8, 9.5, 11, 13, 16, 19, 22, 27, 32, 38, 45,
  54, 64,
];
const APERTURE_THIRD = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11,
  13, 14, 16, 18, 20, 22, 25, 29, 32, 36, 40, 45, 51, 57, 64,
];

const APERTURE_TABLES: Record<StopIncrement, number[]> = {
  full: APERTURE_FULL,
  half: APERTURE_HALF,
  third: APERTURE_THIRD,
};

/** Snaps a typed value to the nearest value actually in the chosen sequence, so an odd entry like "1.3" still lands somewhere sensible. */
function nearestIndex(table: number[], value: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < table.length; i++) {
    const d = Math.abs(table[i] - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function generateApertureStops(
  minAperture: number,
  maxAperture: number,
  increment: StopIncrement,
): number[] {
  const table = APERTURE_TABLES[increment];
  const lo = Math.min(minAperture, maxAperture);
  const hi = Math.max(minAperture, maxAperture);
  const start = nearestIndex(table, lo);
  const end = nearestIndex(table, hi);
  return table.slice(Math.min(start, end), Math.max(start, end) + 1);
}

/**
 * Standard shutter speed sequences (seconds as fractions), same
 * full/half/third-stop standard used across manual and electronic cameras.
 * Generation covers 1 second down to the camera's fastest speed — the
 * slower end (multi-second, bulb) varies too much between bodies to guess,
 * so those are left to Custom mode.
 */
const SHUTTER_FULL = [1, 2, 4, 8, 15, 30, 60, 125, 250, 500, 1000, 2000, 4000, 8000];
const SHUTTER_HALF = [
  1, 1.4, 2, 3, 4, 6, 8, 11, 15, 21, 30, 45, 60, 90, 125, 180, 250, 350, 500, 750, 1000, 1500,
  2000, 3000, 4000, 6000, 8000,
];
const SHUTTER_THIRD = [
  1, 1.25, 1.6, 2, 2.5, 3, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 160, 200,
  250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000,
];

const SHUTTER_TABLES: Record<StopIncrement, number[]> = {
  full: SHUTTER_FULL,
  half: SHUTTER_HALF,
  third: SHUTTER_THIRD,
};

export const FASTEST_SHUTTER_OPTIONS = [500, 1000, 2000, 4000, 8000];

function formatShutterValue(denominator: number): string {
  if (denominator <= 1) return "1";
  // Whole-number denominators are conventional fractions (1/2, 1/3, 1/125…).
  // Fractional denominators only occur for the in-between half/third-stop
  // speeds slower than about 1/4s (e.g. a genuine speed of 1/1.4s), which
  // don't have a clean "1/N" reading on a real dial — cameras with that
  // increment show these as decimal seconds instead (e.g. "0.7s"). Rounding
  // a fractional denominator to the nearest integer, instead of switching
  // notation, was the actual bug: 1.4 and 1.6 both round to values that
  // collide with the whole-number entries already in the table (producing
  // duplicate "1/1" / "1/2" entries) — this branch avoids that entirely
  // rather than rounding around it.
  if (Number.isInteger(denominator)) return `1/${denominator}`;
  return `${(1 / denominator).toFixed(1)}s`;
}

/** From 1 second down to `fastestDenominator` (e.g. 1000 for a 1/1000s top speed), at the chosen increment. */
export function generateShutterSpeeds(
  fastestDenominator: number,
  increment: StopIncrement,
): string[] {
  const table = SHUTTER_TABLES[increment];
  const end = nearestIndex(table, fastestDenominator);
  return table.slice(0, end + 1).map(formatShutterValue);
}

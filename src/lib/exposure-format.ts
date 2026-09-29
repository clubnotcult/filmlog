/** Shared formatting for exposure values, used by the shooter, frame browser, and frame detail/edit views. */

export function formatPush(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatAperture(value: number): string {
  return `f/${value}`;
}

/** One-line exposure summary for a logged frame, e.g. "1/125 · f/8 · 28mm · 0". Returns null if any required piece is missing (shouldn't happen for a logged frame, but keeps callers safe). */
export function formatExposureSummary(frame: {
  shutter_speed: string | null;
  aperture: number | null;
  push_pull: number | null;
}, lensLabel: string | null): string | null {
  if (frame.shutter_speed === null || frame.aperture === null) return null;
  const parts = [frame.shutter_speed, formatAperture(frame.aperture)];
  if (lensLabel) parts.push(lensLabel);
  parts.push(formatPush(frame.push_pull ?? 0));
  return parts.join(" · ");
}

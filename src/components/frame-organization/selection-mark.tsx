import type { Selection } from "@/lib/database.types";

/**
 * The static selection glyph shown on thumbnails: ♥ for a heart, ★ for a
 * star, nothing for unmarked. Type, not a badge — same restraint as the rest
 * of the interface. The star is set a half-step larger than the heart so the
 * higher level reads as higher at a glance without relying on colour.
 */
export function SelectionMark({ selection }: { selection: Selection | null }) {
  if (!selection) return null;
  return (
    <span
      className={`numeral absolute right-1.5 top-1 leading-none text-accent drop-shadow ${
        selection === "star" ? "text-base" : "text-sm"
      }`}
      aria-label={selection === "star" ? "Star" : "Heart"}
    >
      {selection === "star" ? "★" : "♥"}
    </span>
  );
}

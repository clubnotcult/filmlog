import { filmFormatLabel, filmTypeLabel } from "@/lib/film-classification";

/**
 * System tags are never stored anywhere — they're computed fresh from a
 * frame's existing roll/gear metadata every time they're needed. That's the
 * whole design: "system tags should update automatically when metadata
 * changes" is trivially true when there's nothing to update — recomputing
 * from the current film stock, format, camera, and lens can never go stale,
 * because it never remembers a previous answer in the first place.
 *
 * Deliberately narrow set (format, film stock, film type, camera, lens, location) matching the
 * spec's own examples — not every field on a frame is a good "browse by"
 * category (exposure values change every frame; these four are stable
 * per-roll or per-gear-choice properties worth grouping photos by).
 */
export function computeSystemTags(input: {
  filmStockName: string | null;
  /** The film stock's stored format value (e.g. "35mm", "large_format"); tagged by its label. */
  format: string | null;
  /** The film stock's stored classification (e.g. "color_negative"); tagged by its label. */
  filmType?: string | null;
  cameraName: string | null;
  lensName: string | null;
  locationName?: string | null;
}): string[] {
  const tags: string[] = [];
  // Format and type come from the film stock's structured fields, not text
  // typed per roll. An unclassified stock simply contributes no type tag.
  const format = filmFormatLabel(input.format) ?? input.format;
  if (format) tags.push(format);
  if (input.filmStockName) tags.push(input.filmStockName);
  const filmType = filmTypeLabel(input.filmType);
  if (filmType) tags.push(filmType);
  if (input.cameraName) tags.push(input.cameraName);
  if (input.lensName) tags.push(input.lensName);
  if (input.locationName) tags.push(input.locationName);
  return tags;
}

/**
 * The exact set pushed to a Drive file's description: system tags plus user
 * tags, deduplicated case-insensitively (a user could plausibly create a
 * manual tag that happens to match a system one, e.g. typing "Portra 400"
 * by hand) and re-derived in full every time rather than appended to —
 * that's what keeps this immune to duplicate or stale entries by
 * construction rather than by careful bookkeeping.
 */
export function combineTagsForDrive(systemTags: string[], userTags: string[]): string[] {
  const seen = new Set<string>();
  const combined: string[] = [];
  for (const tag of [...systemTags, ...userTags]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(tag);
  }
  return combined;
}

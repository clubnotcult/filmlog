/**
 * Controlled vocabularies for a film stock's classification and format.
 *
 * Stored values are stable snake_case keys; labels are what people see and
 * what becomes the system tags, Drive descriptions and AI export values. Keep
 * these in step with the check constraints in the film_classification
 * migration.
 */
export const FILM_TYPES = [
  { value: "color_negative", label: "Color Negative" },
  { value: "bw_negative", label: "Black & White Negative" },
  { value: "color_slide", label: "Color Slide" },
  { value: "bw_reversal", label: "Black & White Reversal" },
  { value: "instant", label: "Instant" },
  { value: "other", label: "Other" },
] as const;
export type FilmType = (typeof FILM_TYPES)[number]["value"];

export const FILM_FORMATS = [
  { value: "35mm", label: "35mm" },
  { value: "120", label: "120" },
  { value: "large_format", label: "Large Format" },
  { value: "half_frame", label: "Half Frame" },
  { value: "aps", label: "APS" },
  { value: "instant", label: "Instant" },
  { value: "other", label: "Other" },
] as const;
export type FilmFormat = (typeof FILM_FORMATS)[number]["value"];

export function isFilmType(value: unknown): value is FilmType {
  return FILM_TYPES.some((t) => t.value === value);
}
export function isFilmFormat(value: unknown): value is FilmFormat {
  return FILM_FORMATS.some((f) => f.value === value);
}

/** Display label for a stored film type; null when unclassified. */
export function filmTypeLabel(value: string | null | undefined): string | null {
  return FILM_TYPES.find((t) => t.value === value)?.label ?? null;
}

/** Display label for a stored format; null when unspecified. */
export function filmFormatLabel(value: string | null | undefined): string | null {
  return FILM_FORMATS.find((f) => f.value === value)?.label ?? null;
}

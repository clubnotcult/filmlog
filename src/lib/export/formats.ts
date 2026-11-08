import type { ExportRow } from "./gather";

function csvEscape(value: string | number | boolean | null): string {
  if (value === null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const CSV_HEADERS = [
  "frame_number",
  "drive_filename",
  "roll_title",
  "roll_start_date",
  "roll_end_date",
  "film_stock",
  "film_type",
  "film_format",
  "iso",
  "camera",
  "exposure_control",
  "lens",
  "lens_source",
  "focal_length",
  "location",
  "shutter_speed",
  "aperture",
  "meter_type",
  "metadata_logged",
  "exposure_evaluation",
  "selection",
  "global_tags",
  "frame_tags",
  "tags",
  "notes",
] as const;

/** Shutter/aperture as exported: the value, "unknown" if not logged, "not_applicable" if the camera sets it. */
function exposureCell(r: ExportRow, field: "shutter" | "aperture"): string | number | null {
  const applicable = field === "shutter" ? r.shutterApplicable : r.apertureApplicable;
  if (!applicable) return "not_applicable";
  const value = field === "shutter" ? r.shutterSpeed : r.aperture;
  return value ?? (r.metadataLogged ? null : "unknown");
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.frameNumber,
        r.driveFilename,
        r.rollTitle,
        r.rollStartDate,
        r.rollEndDate,
        r.filmStock,
        r.filmType,
        r.filmFormat,
        r.iso,
        r.camera,
        r.exposureControl,
        r.lens,
        r.lensSource,
        r.focalLength,
        r.location,
        exposureCell(r, "shutter"),
        exposureCell(r, "aperture"),
        r.meterType,
        r.metadataLogged,
        r.exposureEvaluation,
        r.selection,
        r.globalTags.join("; "),
        r.frameTags.join("; "),
        r.tags.join("; "),
        r.notes,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function toJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

/**
 * A plain-text format meant to be pasted directly into an LLM conversation —
 * dense enough to fit a large archive in a reasonable token budget, but
 * still human-readable, with a short framing header explaining the schema
 * so the model doesn't have to infer field meanings from column order.
 */
export function toAiAnalysisText(rows: ExportRow[]): string {
  const header = [
    "FILM LOG — SHOOTING HISTORY EXPORT",
    `${rows.length} frames.`,
    "",
    "Each line is one frame: drive filename | roll | roll start–closing date | film stock (ISO, film type, format) | camera (exposure control) | lens (focal length) | shutter | aperture | meter | location | exposure evaluation | selection | global tags | frame tags | notes",
    "lens is the effective lens: the frame's own if set, otherwise the roll's default lens; \"unknown\" means neither was recorded — it is never guessed.",
    "global tags apply to every frame of the roll; frame tags were assigned to that frame individually.",
    "\"not applicable\" for shutter or aperture means the camera sets it automatically (e.g. a point-and-shoot compact), so there is no value to record.",
    "selection is the photographer's own subjective attention level, not a technical score: none = an ordinary frame, heart = worth spending time on, star = one of the strongest. It is independent of exposure evaluation — a starred frame can be Too Dark or Too Bright, and a Correct frame can be unmarked.",
    "film type is the film stock's classification (Color Negative, Black & White Negative, Color Slide, Black & White Reversal, Instant, Other), or \"unclassified\" if it has not been set; it applies to every frame of that stock.",
    "\"unknown\" shutter or aperture means the frame was imported or not logged — the setting is genuinely unknown, not zero or default.",
    "",
  ].join("\n");

  const lines = rows.map((r) => {
    const shutter = !r.shutterApplicable ? "not applicable" : (r.shutterSpeed ?? "unknown");
    const aperture = !r.apertureApplicable ? "not applicable" : r.aperture !== null ? `f/${r.aperture}` : "unknown";
    const parts = [
      r.driveFilename ?? "no image",
      r.rollTitle,
      r.rollEndDate ? `${r.rollStartDate}–${r.rollEndDate}` : r.rollStartDate,
      `${r.filmStock} (${[r.iso ? `ISO ${r.iso}` : null, r.filmType ?? "unclassified", r.filmFormat].filter(Boolean).join(", ")})`,
      `${r.camera} (${r.exposureControl})`,
      r.lens ? `${r.lens}${r.focalLength ? ` (${r.focalLength})` : ""}` : "unknown",
      shutter,
      aperture,
      r.meterType ?? "—",
      r.location ?? "—",
      r.exposureEvaluation ?? "—",
      `selection: ${r.selection}`,
      `global: ${r.globalTags.join(",") || "—"}`,
      `frame: ${r.frameTags.join(",") || "—"}`,
      r.notes ?? "",
    ];
    return `Frame ${r.frameNumber} | ${parts.join(" | ")}`;
  });

  const footer = [
    "",
    "Suggested analysis: compare the settings, focal lengths, apertures, film stocks, film types, and locations of starred and hearted frames against unmarked ones; identify overused apertures; count exposure problems (Too Dark / Too Bright) separately from selection; and look at meter usage trends.",
  ].join("\n");

  return header + lines.join("\n") + footer;
}

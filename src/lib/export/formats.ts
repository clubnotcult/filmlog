import type { ExportRow } from "./gather";

function csvEscape(value: string | number | boolean | null): string {
  if (value === null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const CSV_HEADERS = [
  "frame_number",
  "roll_title",
  "roll_start_date",
  "roll_end_date",
  "film_stock",
  "iso",
  "camera",
  "lens",
  "focal_length",
  "shutter_speed",
  "aperture",
  "meter_type",
  "metadata_logged",
  "exposure_evaluation",
  "selection",
  "tags",
  "notes",
] as const;

export function toCsv(rows: ExportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.frameNumber,
        r.rollTitle,
        r.rollStartDate,
        r.rollEndDate,
        r.filmStock,
        r.iso,
        r.camera,
        r.lens,
        r.focalLength,
        r.shutterSpeed,
        r.aperture,
        r.meterType,
        r.metadataLogged,
        r.exposureEvaluation,
        r.selection,
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
    "Each line is one frame: roll | date | film stock (ISO) | camera | lens (focal length) | shutter | aperture | meter | exposure evaluation | selection | tags | notes",
    "selection is the photographer's own subjective attention level, not a technical score: none = an ordinary frame, heart = worth spending time on, star = one of the strongest. It is independent of exposure evaluation — a starred frame can be Too Dark or Too Bright, and a Correct frame can be unmarked.",
    "Unlogged frames show \"unlogged\" in place of exposure values — their settings are genuinely unknown, not zero or default.",
    "",
  ].join("\n");

  const lines = rows.map((r) => {
    const exposure = r.metadataLogged
      ? `${r.shutterSpeed ?? "—"} | f/${r.aperture ?? "—"}`
      : "unlogged";
    const parts = [
      r.rollTitle,
      r.rollStartDate,
      `${r.filmStock}${r.iso ? ` (ISO ${r.iso})` : ""}`,
      r.camera,
      r.lens ? `${r.lens}${r.focalLength ? ` (${r.focalLength})` : ""}` : "—",
      exposure,
      r.meterType ?? "—",
      r.exposureEvaluation ?? "—",
      `selection: ${r.selection}`,
      r.tags.length > 0 ? r.tags.join(",") : "",
      r.notes ?? "",
    ];
    return `Frame ${r.frameNumber} | ${parts.join(" | ")}`;
  });

  const footer = [
    "",
    "Suggested analysis: compare the settings, focal lengths, apertures, film stocks, and locations of starred and hearted frames against unmarked ones; identify overused apertures; count exposure problems (Too Dark / Too Bright) separately from selection; and look at meter usage trends.",
  ].join("\n");

  return header + lines.join("\n") + footer;
}

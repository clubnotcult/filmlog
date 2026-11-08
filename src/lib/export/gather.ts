import type { SupabaseClient } from "@supabase/supabase-js";
import { filmFormatLabel, filmTypeLabel } from "@/lib/film-classification";
import type { Database } from "@/lib/database.types";
import { generateRollTitle } from "@/lib/roll-title";
import { effectiveLensId, effectiveLocationId, effectiveUserTags, groupTagNames } from "@/lib/effective-metadata";
import { apertureApplies, exposureControlLabel, shutterApplies } from "@/lib/camera-exposure";

export type ExportRow = {
  frameNumber: number;
  /** The image's Drive filename — its identity in the archive; null if no image is attached. */
  driveFilename: string | null;
  rollTitle: string;
  rollStartDate: string;
  rollEndDate: string | null;
  filmStock: string;
  iso: number | null;
  /** Film classification label, e.g. "Color Negative"; null if the stock is unclassified. */
  filmType: string | null;
  /** Film format label, e.g. "35mm", "120"; null if unspecified. */
  filmFormat: string | null;
  camera: string;
  /** Camera exposure control label (Manual, Automatic...). */
  exposureControl: string;
  /** Effective lens: the frame's own, else the roll default; null = unknown (never inferred). */
  lens: string | null;
  /** Where the effective lens came from. */
  lensSource: "frame" | "roll" | null;
  focalLength: string | null;
  /** Effective location: the frame's own, else the roll default. */
  location: string | null;
  shutterSpeed: string | null;
  aperture: number | null;
  meterType: string | null;
  metadataLogged: boolean;
  notes: string | null;
  exposureEvaluation: string | null;
  /** "none" | "heart" | "star" — spelled out, never numeric, so it can't be averaged or mistaken for a score. */
  selection: "none" | "heart" | "star";
  /** Shutter speed / aperture: "not_applicable" when the camera sets them itself. */
  shutterApplicable: boolean;
  apertureApplicable: boolean;
  /** The roll's global tags (apply to every frame of the roll). */
  globalTags: string[];
  /** Tags assigned to this frame individually. */
  frameTags: string[];
  /** Effective user tags: global ∪ frame, de-duplicated. */
  tags: string[];
};

/**
 * One row per frame across the whole archive, with every field a shooting-
 * habits analysis would plausibly want already joined in. Built as a handful
 * of targeted queries (frames, then the small lookup tables, then tags) and
 * assembled in memory rather than one giant SQL join — at a personal
 * archive's scale (hundreds to low thousands of frames, a handful of gear
 * items) this is simpler to read and just as fast in practice.
 */
export async function gatherExportRows(
  supabase: SupabaseClient<Database>,
): Promise<ExportRow[]> {
  const { data: frames } = await supabase
    .from("frames")
    .select("*")
    .order("created_at", { ascending: true });
  const frameList = frames ?? [];
  if (frameList.length === 0) return [];

  const rollIds = [...new Set(frameList.map((f) => f.roll_id))];

  const [{ data: rolls }, { data: lenses }, { data: locations }, { data: frameTagRows }, { data: rollTagRows }] =
    await Promise.all([
      supabase
        .from("rolls")
        .select("id, custom_title, start_date, end_date, film_stock_id, camera_id, default_lens_id, location_id"),
      supabase.from("lenses").select("id, name, focal_length"),
      supabase.from("locations").select("id, name"),
      supabase.from("frame_tags").select("frame_id, tags(name)").in("frame_id", frameList.map((f) => f.id)),
      supabase.from("roll_tags").select("roll_id, tags(name)").in("roll_id", rollIds),
    ]);

  const rollById = new Map((rolls ?? []).filter((r) => rollIds.includes(r.id)).map((r) => [r.id, r]));
  const lensById = new Map((lenses ?? []).map((l) => [l.id, l]));
  const locationById = new Map((locations ?? []).map((l) => [l.id, l.name]));

  const filmStockIds = [...new Set([...rollById.values()].map((r) => r.film_stock_id))];
  const cameraIds = [...new Set([...rollById.values()].map((r) => r.camera_id))];
  const [{ data: filmStocks }, { data: cameras }] = await Promise.all([
    supabase.from("film_stocks").select("id, name, iso, format, film_type").in("id", filmStockIds),
    supabase.from("cameras").select("id, name, exposure_control").in("id", cameraIds),
  ]);
  const filmStockById = new Map((filmStocks ?? []).map((f) => [f.id, f]));
  const cameraById = new Map((cameras ?? []).map((c) => [c.id, c]));

  const tagsByFrame = groupTagNames(frameTagRows as never, "frame_id");
  const tagsByRoll = groupTagNames(rollTagRows as never, "roll_id");

  return frameList.map((f) => {
    const roll = rollById.get(f.roll_id);
    const filmStock = roll ? filmStockById.get(roll.film_stock_id) : undefined;
    const camera = roll ? cameraById.get(roll.camera_id) : undefined;
    const lensRef = roll ? effectiveLensId(f, roll) : { value: f.lens_id, source: f.lens_id ? ("frame" as const) : null };
    const lens = lensRef.value ? lensById.get(lensRef.value) : undefined;
    const locationId = roll ? effectiveLocationId(f, roll).value : f.location_id;
    const globalTags = tagsByRoll.get(f.roll_id) ?? [];
    const frameTags = tagsByFrame.get(f.id) ?? [];
    const control = (camera as { exposure_control?: string } | undefined)?.exposure_control ?? "manual";

    return {
      frameNumber: f.frame_number,
      driveFilename: f.drive_filename,
      rollTitle: roll
        ? generateRollTitle({
            startDate: roll.start_date,
            endDate: roll.end_date,
            filmStockName: filmStock?.name ?? "Unknown film",
            customTitle: roll.custom_title,
          })
        : "Unknown roll",
      rollStartDate: roll?.start_date ?? "",
      rollEndDate: roll?.end_date ?? null,
      filmStock: filmStock?.name ?? "Unknown",
      iso: filmStock?.iso ?? null,
      filmType: filmTypeLabel(filmStock?.film_type),
      filmFormat: filmFormatLabel(filmStock?.format),
      camera: camera?.name ?? "Unknown",
      exposureControl: exposureControlLabel(control),
      lens: lens?.name ?? null,
      lensSource: lens ? lensRef.source : null,
      focalLength: lens?.focal_length ?? null,
      location: locationId ? (locationById.get(locationId) ?? null) : null,
      shutterSpeed: f.shutter_speed,
      aperture: f.aperture,
      meterType: f.meter_type,
      metadataLogged: f.metadata_logged,
      notes: f.notes,
      exposureEvaluation: f.exposure_evaluation,
      selection: f.selection ?? "none",
      shutterApplicable: shutterApplies(control),
      apertureApplicable: apertureApplies(control),
      globalTags,
      frameTags,
      tags: effectiveUserTags(globalTags, frameTags).map((t) => t.name),
    };
  });
}

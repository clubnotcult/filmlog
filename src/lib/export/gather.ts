import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type ExportRow = {
  frameNumber: number;
  rollTitle: string;
  rollStartDate: string;
  rollEndDate: string | null;
  filmStock: string;
  iso: number | null;
  camera: string;
  lens: string | null;
  focalLength: string | null;
  shutterSpeed: string | null;
  aperture: number | null;
  meterType: string | null;
  metadataLogged: boolean;
  notes: string | null;
  exposureEvaluation: string | null;
  /** "none" | "heart" | "star" — spelled out, never numeric, so it can't be averaged or mistaken for a score. */
  selection: "none" | "heart" | "star";
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
  const lensIds = [...new Set(frameList.map((f) => f.lens_id).filter((v): v is string => Boolean(v)))];

  const [{ data: rolls }, { data: lenses }, { data: frameTagRows }] = await Promise.all([
    supabase.from("rolls").select("id, custom_title, start_date, end_date, film_stock_id, camera_id"),
    supabase.from("lenses").select("id, name, focal_length"),
    supabase.from("frame_tags").select("frame_id, tags(name)").in("frame_id", frameList.map((f) => f.id)),
  ]);

  const rollById = new Map((rolls ?? []).filter((r) => rollIds.includes(r.id)).map((r) => [r.id, r]));
  const lensById = new Map((lenses ?? []).filter((l) => lensIds.includes(l.id)).map((l) => [l.id, l]));

  const filmStockIds = [...new Set([...rollById.values()].map((r) => r.film_stock_id))];
  const cameraIds = [...new Set([...rollById.values()].map((r) => r.camera_id))];
  const [{ data: filmStocks }, { data: cameras }] = await Promise.all([
    supabase.from("film_stocks").select("id, name, iso").in("id", filmStockIds),
    supabase.from("cameras").select("id, name").in("id", cameraIds),
  ]);
  const filmStockById = new Map((filmStocks ?? []).map((f) => [f.id, f]));
  const cameraById = new Map((cameras ?? []).map((c) => [c.id, c]));

  const tagsByFrame = new Map<string, string[]>();
  for (const row of frameTagRows ?? []) {
    const name = (row.tags as unknown as { name: string } | null)?.name;
    if (!name) continue;
    const list = tagsByFrame.get(row.frame_id) ?? [];
    list.push(name);
    tagsByFrame.set(row.frame_id, list);
  }

  return frameList.map((f) => {
    const roll = rollById.get(f.roll_id);
    const filmStock = roll ? filmStockById.get(roll.film_stock_id) : undefined;
    const camera = roll ? cameraById.get(roll.camera_id) : undefined;
    const lens = f.lens_id ? lensById.get(f.lens_id) : undefined;

    return {
      frameNumber: f.frame_number,
      rollTitle: roll?.custom_title ?? roll?.id ?? "Unknown roll",
      rollStartDate: roll?.start_date ?? "",
      rollEndDate: roll?.end_date ?? null,
      filmStock: filmStock?.name ?? "Unknown",
      iso: filmStock?.iso ?? null,
      camera: camera?.name ?? "Unknown",
      lens: lens?.name ?? null,
      focalLength: lens?.focal_length ?? null,
      shutterSpeed: f.shutter_speed,
      aperture: f.aperture,
      meterType: f.meter_type,
      metadataLogged: f.metadata_logged,
      notes: f.notes,
      exposureEvaluation: f.exposure_evaluation,
      selection: f.selection ?? "none",
      tags: tagsByFrame.get(f.id) ?? [],
    };
  });
}

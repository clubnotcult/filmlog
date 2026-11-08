import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { computeSystemTags, combineTagsForDrive } from "@/lib/tags/system-tags";
import { effectiveLensId, effectiveLocationId, groupTagNames } from "@/lib/effective-metadata";

export type FrameTagSet = {
  frameId: string;
  driveFileId: string | null;
  systemTags: string[];
  rollTags: string[];
  frameTags: string[];
  /** system + roll + frame, de-duplicated — exactly what goes into the Drive description. */
  driveTags: string[];
};

/**
 * Every tag that applies to each frame, resolved with roll inheritance
 * (effective lens and location feed the system tags; the roll's global tags
 * join the frame's own). Used by every path that writes tags to Drive, so a
 * bulk tag, a roll-tag change, a sync and an import all push the same set.
 */
export async function loadFrameTagSets(
  supabase: SupabaseClient<Database>,
  frameIds: string[],
): Promise<FrameTagSet[]> {
  if (frameIds.length === 0) return [];
  const [{ data: frames }, { data: frameTagRows }] = await Promise.all([
    supabase.from("frames").select("id, roll_id, lens_id, location_id, drive_file_id").in("id", frameIds),
    supabase.from("frame_tags").select("frame_id, tags(name)").in("frame_id", frameIds),
  ]);
  const frameList = frames ?? [];
  const rollIds = [...new Set(frameList.map((f) => f.roll_id))];
  const [{ data: rolls }, { data: rollTagRows }] = await Promise.all([
    supabase.from("rolls").select("id, film_stock_id, camera_id, default_lens_id, location_id").in("id", rollIds),
    supabase.from("roll_tags").select("roll_id, tags(name)").in("roll_id", rollIds),
  ]);
  const rollById = new Map((rolls ?? []).map((r) => [r.id, r]));

  const lensIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const f of frameList) {
    const roll = rollById.get(f.roll_id);
    if (!roll) continue;
    const lens = effectiveLensId(f, roll).value;
    const loc = effectiveLocationId(f, roll).value;
    if (lens) lensIds.add(lens);
    if (loc) locationIds.add(loc);
  }
  const filmStockIds = [...new Set((rolls ?? []).map((r) => r.film_stock_id))];
  const cameraIds = [...new Set((rolls ?? []).map((r) => r.camera_id))];
  const [{ data: lenses }, { data: locations }, { data: filmStocks }, { data: cameras }] = await Promise.all([
    supabase.from("lenses").select("id, name").in("id", [...lensIds]),
    supabase.from("locations").select("id, name").in("id", [...locationIds]),
    supabase.from("film_stocks").select("id, name, format, film_type").in("id", filmStockIds),
    supabase.from("cameras").select("id, name").in("id", cameraIds),
  ]);
  const lensName = new Map((lenses ?? []).map((l) => [l.id, l.name]));
  const locationName = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const filmStockById = new Map((filmStocks ?? []).map((f) => [f.id, f]));
  const cameraName = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const frameTagsById = groupTagNames(frameTagRows as never, "frame_id");
  const rollTagsById = groupTagNames(rollTagRows as never, "roll_id");

  return frameList.map((f) => {
    const roll = rollById.get(f.roll_id);
    const stock = roll ? filmStockById.get(roll.film_stock_id) : undefined;
    const lensId = roll ? effectiveLensId(f, roll).value : f.lens_id;
    const locId = roll ? effectiveLocationId(f, roll).value : f.location_id;
    const systemTags = computeSystemTags({
      filmStockName: stock?.name ?? null,
      format: stock?.format ?? null,
      filmType: stock?.film_type ?? null,
      cameraName: roll ? (cameraName.get(roll.camera_id) ?? null) : null,
      lensName: lensId ? (lensName.get(lensId) ?? null) : null,
      locationName: locId ? (locationName.get(locId) ?? null) : null,
    });
    const rollTags = rollTagsById.get(f.roll_id) ?? [];
    const frameTags = frameTagsById.get(f.id) ?? [];
    return {
      frameId: f.id,
      driveFileId: f.drive_file_id,
      systemTags,
      rollTags,
      frameTags,
      driveTags: combineTagsForDrive(systemTags, [...rollTags, ...frameTags]),
    };
  });
}

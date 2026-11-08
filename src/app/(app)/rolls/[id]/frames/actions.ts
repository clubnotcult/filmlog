"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { ExposureEvaluation, Frame, MeterType, Selection } from "@/lib/database.types";
import { METER_TYPES } from "@/lib/database.types";
import { loadFrameTagSets } from "@/lib/tags/frame-tag-sets";

export type FormState = { error: string | null };

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

function optMeterType(formData: FormData, key: string): MeterType | null {
  const value = str(formData, key);
  return (METER_TYPES as string[]).includes(value) ? (value as MeterType) : null;
}

/**
 * Edits a saved (historical) frame via the update_frame RPC. A frame is a
 * single independent row — this can only ever change the one row identified
 * by frameId, so it can never affect any other frame's data or the roll's
 * current shooting state.
 *
 * The same aperture-belongs-to-lens rule enforced while shooting is enforced
 * here too, server-side, not just by the form's own field filtering.
 *
 * If returnTo is present (used by the Active Roll "fix previous frame" fast
 * correction flow), redirects there instead of the frame's own detail page —
 * validated as a same-origin relative path to avoid an open redirect, since
 * it arrives as ordinary form data.
 */
export async function updateFrame(
  rollId: string,
  frameId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const metadataLogged = str(formData, "metadata_logged") === "true";
  const returnToRaw = optStr(formData, "return_to");
  const returnTo = returnToRaw && returnToRaw.startsWith("/") ? returnToRaw : null;
  const supabase = await createClient();

  // Lens and location are explicit per-frame overrides in both modes; an
  // empty value means "inherit from the roll", never a guessed lens.
  const lensId = optStr(formData, "lens_id");
  const locationId = optStr(formData, "location_id");

  if (!metadataLogged) {
    const { error } = await supabase.rpc("update_frame", {
      p_frame_id: frameId,
      p_metadata_logged: false,
      p_lens_id: lensId,
      p_location_id: locationId,
      p_notes: optStr(formData, "notes"),
    });
    if (error) return { error: friendlyDbError(error) };
  } else {
    // Which settings are required depends on the roll's camera — the
    // database enforces it (validate_frame_exposure); missing values are
    // passed as null rather than invented.
    const shutterSpeed = optStr(formData, "shutter_speed");
    const apertureRaw = str(formData, "aperture");
    const aperture = apertureRaw ? Number(apertureRaw) : null;
    if (aperture !== null && Number.isNaN(aperture)) return { error: "Aperture must be a number." };

    const pushRaw = str(formData, "push_pull");
    const pushPull = pushRaw ? Number(pushRaw) : 0;
    if (Number.isNaN(pushPull)) return { error: "Push/pull must be a number." };

    const { error } = await supabase.rpc("update_frame", {
      p_frame_id: frameId,
      p_metadata_logged: true,
      p_shutter_speed: shutterSpeed,
      p_aperture: aperture,
      p_lens_id: lensId,
      p_push_pull: pushPull,
      p_notes: optStr(formData, "notes"),
      p_meter_type: optMeterType(formData, "meter_type"),
      p_location_id: locationId,
    });
    if (error) return { error: friendlyDbError(error) };
  }

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  if (returnTo) revalidatePath(returnTo);
  redirect(returnTo ?? `/rolls/${rollId}/frames/${frameId}`);
}

/**
 * Same underlying update_frame RPC as `updateFrame` above, called with plain
 * arguments instead of FormData and returning the updated row instead of
 * redirecting — for the Active Roll screen's inline "review an existing
 * frame and save an edit" flow (Phase 6B), which manages its own frame list
 * in memory rather than navigating to a page.
 */
export async function updateFrameFields(
  rollId: string,
  frameId: string,
  input: {
    metadataLogged: boolean;
    shutterSpeed: string | null;
    aperture: number | null;
    lensId: string | null;
    pushPull: number | null;
    notes: string | null;
    meterType: MeterType | null;
    locationId: string | null;
  },
): Promise<ActionResult<Frame>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_frame", {
    p_frame_id: frameId,
    p_metadata_logged: input.metadataLogged,
    p_shutter_speed: input.metadataLogged ? input.shutterSpeed : null,
    p_aperture: input.metadataLogged ? input.aperture : null,
    p_lens_id: input.lensId,
    p_push_pull: input.metadataLogged ? input.pushPull : null,
    p_notes: input.notes,
    p_meter_type: input.metadataLogged ? input.meterType : null,
    p_location_id: input.locationId,
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong saving the frame." };

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  revalidatePath(`/active-roll/${rollId}`);

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Favorites, exposure evaluation, tags, and frame removal (Phase 9)
// ---------------------------------------------------------------------------

/**
 * Sets a frame's selection level (heart / star / none). One column, so the
 * levels are mutually exclusive by construction — there is no way to write
 * "heart and star" — and this deliberately touches nothing else: not
 * exposure_evaluation, not tags, not navigation. Revalidates every surface a
 * selection mark is shown or filtered on (the roll grid, Explore, and frame
 * detail pages), so a filter applied afterwards reflects the change without
 * leaving and re-entering a page.
 */
export async function setFrameSelection(
  rollId: string,
  frameId: string,
  selection: Selection | null,
): Promise<ActionResult<Selection | null>> {
  const supabase = await createClient();
  const { error } = await supabase.from("frames").update({ selection }).eq("id", frameId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/explore");
  revalidatePath("/rolls/[id]/frames/[frameId]", "page");
  return { ok: true, data: selection };
}

export async function setFrameExposureEvaluation(
  rollId: string,
  frameId: string,
  evaluation: ExposureEvaluation | null,
): Promise<ActionResult<boolean>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("frames")
    .update({ exposure_evaluation: evaluation })
    .eq("id", frameId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  return { ok: true, data: true };
}

/** Every tag the person has, for autocomplete — a tiny table per user, cheap to fetch whole. */
export async function listTags(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tags").select("id, name").order("name");
  return data ?? [];
}

export async function frameTagNames(frameId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("frame_tags")
    .select("tags(name)")
    .eq("frame_id", frameId);
  return (data ?? [])
    .map((row) => (row.tags as unknown as { name: string } | null)?.name)
    .filter((n): n is string => Boolean(n));
}

/**
 * The Drive description tag set for each given frame (system + roll + frame
 * tags, with roll inheritance applied) — for pushing to Drive after a sync,
 * an import, or a change to a roll's global tags or defaults.
 */
export async function driveTagUpdatesForFrames(
  frameIds: string[],
): Promise<{ driveFileId: string; tags: string[] }[]> {
  const supabase = await createClient();
  const sets = await loadFrameTagSets(supabase, frameIds);
  return sets
    .filter((t) => t.driveFileId !== null)
    .map((t) => ({ driveFileId: t.driveFileId as string, tags: t.driveTags }));
}

export async function addTagToFrame(
  rollId: string,
  frameId: string,
  tagName: string,
): Promise<ActionResult<string>> {
  if (!tagName.trim()) return { ok: false, error: "Tag name is required." };
  const supabase = await createClient();
  const { data: tag, error: tagError } = await supabase.rpc("get_or_create_tag", {
    p_name: tagName,
  });
  if (tagError || !tag) return { ok: false, error: friendlyDbError(tagError) };

  const { error } = await supabase
    .from("frame_tags")
    .insert({ frame_id: frameId, tag_id: tag.id });
  // A duplicate (already-tagged) is fine, not an error — same tag can't be
  // applied twice by primary key, but that's not a mistake worth surfacing.
  if (error && error.code !== "23505") return { ok: false, error: friendlyDbError(error) };

  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  return { ok: true, data: tag.name };
}

export async function removeTagFromFrame(
  rollId: string,
  frameId: string,
  tagId: string,
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("frame_tags")
    .delete()
    .eq("frame_id", frameId)
    .eq("tag_id", tagId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  return { ok: true, data: true };
}

/** Applies one tag to many frames at once — the bulk-tagging workflow. */
export type BulkTagResult = {
  taggedCount: number;
  /** Per-frame Drive push data — only for frames that already have a synced Drive file. */
  driveUpdates: { driveFileId: string; tags: string[] }[];
};

export async function bulkTagFrames(
  rollId: string,
  frameIds: string[],
  tagName: string,
): Promise<ActionResult<BulkTagResult>> {
  if (!tagName.trim()) return { ok: false, error: "Tag name is required." };
  if (frameIds.length === 0) return { ok: false, error: "Select at least one frame." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_tag_frames", {
    p_frame_ids: frameIds,
    p_tag_name: tagName,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Each affected frame's full resulting tag set (system tags from its
  // effective gear/location, the roll's global tags, its own tags), so the
  // client can push the exact description to every synced Drive file.
  const tagSets = await loadFrameTagSets(supabase, frameIds);
  const driveUpdates = tagSets
    .filter((t) => t.driveFileId !== null)
    .map((t) => ({ driveFileId: t.driveFileId as string, tags: t.driveTags }));

  revalidatePath(`/rolls/${rollId}`);
  return { ok: true, data: { taggedCount: data ?? 0, driveUpdates } };
}

/**
 * Removes the most recent frame of a roll — the fast mistake-correction
 * path. remove_last_frame always targets whichever frame actually has the
 * highest frame_number (computed server-side, never passed in), so this can
 * never accidentally remove the wrong frame even if the client's view of
 * "last" were somehow stale.
 */
export async function removeLastFrame(rollId: string): Promise<ActionResult<Frame>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_last_frame", { p_roll_id: rollId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong removing the frame." };

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/active-roll/${rollId}`);
  return { ok: true, data };
}

/**
 * Deletes any single frame, historical or not — more deliberately protected
 * in the UI (stronger confirmation) than removeLastFrame, but the same
 * underlying operation: one row, cascade-deleted tags, no renumbering of
 * other frames. See the Phase 9 migration for why renumbering was
 * considered and rejected — a deleted frame leaves a permanent gap rather
 * than silently changing what later frame numbers mean.
 */
export async function deleteFrame(rollId: string, frameId: string): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { error } = await supabase.from("frames").delete().eq("id", frameId);
  if (error) return { ok: false, error: friendlyDbError(error, { entityInUse: "frame" }) };

  revalidatePath(`/rolls/${rollId}`);
  return { ok: true, data: true };
}

export async function setFrameNotes(
  rollId: string,
  frameId: string,
  notes: string | null,
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { error } = await supabase.from("frames").update({ notes }).eq("id", frameId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  return { ok: true, data: true };
}

/**
 * Inserts a new unlogged frame, shifting every frame after the insertion
 * point up by one. "Insert after frame N" -> afterFrameNumber = N. "Insert
 * before frame N" -> afterFrameNumber = N - 1 (0 to insert before frame 1).
 * All existing image/tag/favorite/evaluation associations are preserved —
 * see the migration for why a renumbering UPDATE on the same rows is safe.
 */
export async function insertFrame(
  rollId: string,
  afterFrameNumber: number,
): Promise<ActionResult<Frame>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("insert_frame", {
    p_roll_id: rollId,
    p_after_frame_number: afterFrameNumber,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong inserting the frame." };

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/active-roll/${rollId}`);
  return { ok: true, data };
}

/** Quick location edit for frame review — resolves the name through get_or_create_location, then attaches it via update_frame so it goes through the same validation path as every other exposure-adjacent field. */
export async function setFrameLocation(
  rollId: string,
  frameId: string,
  locationName: string | null,
): Promise<ActionResult<Frame>> {
  const supabase = await createClient();

  let locationId: string | null = null;
  if (locationName && locationName.trim()) {
    const { data: loc, error: locError } = await supabase.rpc("get_or_create_location", {
      p_name: locationName,
    });
    if (locError || !loc) return { ok: false, error: friendlyDbError(locError) };
    locationId = loc.id;
  }

  const { data: current } = await supabase.from("frames").select("*").eq("id", frameId).single();
  if (!current) return { ok: false, error: "Frame not found." };

  const { data, error } = await supabase.rpc("update_frame", {
    p_frame_id: frameId,
    p_metadata_logged: current.metadata_logged,
    p_shutter_speed: current.shutter_speed,
    p_aperture: current.aperture,
    p_lens_id: current.lens_id,
    p_push_pull: current.push_pull,
    p_notes: current.notes,
    p_meter_type: current.meter_type,
    p_location_id: locationId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong setting the location." };

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  return { ok: true, data };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

import { friendlyDbError } from "@/lib/db-errors";
import type { Roll } from "@/lib/database.types";
import { loadFrameTagSets } from "@/lib/tags/frame-tag-sets";

export type FormState = { error: string | null };

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CreateRollInput = {
  filmStockId: string;
  cameraId: string;
  startDate: string;
  /** Optional: consume one unit from this physical batch. Null = don't touch inventory (e.g. an archive import). */
  filmInventoryItemId: string | null;
  /** Optional. Null = lens unknown unless a frame names one — never inferred. */
  defaultLensId: string | null;
  customTitle: string | null;
  notes: string | null;
  locationName: string | null;
  tagNames: string[];
};

/** Resolves a typed location name through the reuse-by-name library; empty = none. */
async function resolveLocationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string | null,
): Promise<ActionResult<string | null>> {
  if (!name || !name.trim()) return { ok: true, data: null };
  const { data, error } = await supabase.rpc("get_or_create_location", { p_name: name });
  if (error || !data) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, data: data.id };
}

/**
 * Creates a roll in one atomic RPC: the roll, its optional inventory
 * decrement, and its global tags all land together or not at all. Only
 * camera, film stock and start date are required — no lens, no exposure, no
 * shooting session. Returns the id rather than redirecting so the form can
 * go straight on to importing the chosen Drive folder.
 */
export async function createRoll(input: CreateRollInput): Promise<ActionResult<{ id: string }>> {
  if (!input.filmStockId) return { ok: false, error: "Select a film stock." };
  if (!input.cameraId) return { ok: false, error: "Select a camera." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return { ok: false, error: "Start date is required." };

  const supabase = await createClient();
  const location = await resolveLocationId(supabase, input.locationName);
  if (!location.ok) return location;

  const { data: roll, error } = await supabase.rpc("create_roll", {
    p_film_stock_id: input.filmStockId,
    p_camera_id: input.cameraId,
    p_start_date: input.startDate,
    p_film_inventory_item_id: input.filmInventoryItemId,
    p_default_lens_id: input.defaultLensId,
    p_custom_title: input.customTitle,
    p_notes: input.notes,
    p_location_id: location.data,
    p_tag_names: input.tagNames.map((t) => t.trim()).filter(Boolean),
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!roll) return { ok: false, error: "Something went wrong creating the roll." };

  revalidatePath("/rolls");
  revalidatePath("/inventory");
  return { ok: true, data: { id: roll.id } };
}

/** Drive description updates for every synced frame of a roll — after a roll-level change that alters inherited tags. */
async function rollDriveUpdates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rollId: string,
): Promise<DriveTagUpdate[]> {
  const { data: frames } = await supabase
    .from("frames")
    .select("id")
    .eq("roll_id", rollId)
    .not("drive_file_id", "is", null);
  const sets = await loadFrameTagSets(supabase, (frames ?? []).map((f) => f.id));
  return sets
    .filter((t) => t.driveFileId !== null)
    .map((t) => ({ driveFileId: t.driveFileId as string, tags: t.driveTags }));
}

export type DriveTagUpdate = { driveFileId: string; tags: string[] };

function revalidateRollSurfaces(rollId: string) {
  revalidatePath("/rolls");
  revalidatePath("/explore");
  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/rolls/[id]/frames/[frameId]", "page");
}

/**
 * Adds a global tag to a roll. It is inherited by every frame (current and
 * future imports) at read time — nothing is written to frames — and the
 * returned Drive updates let the client refresh each synced image's
 * description.
 */
export async function addRollTag(
  rollId: string,
  tagName: string,
): Promise<ActionResult<{ tag: { id: string; name: string }; driveUpdates: DriveTagUpdate[] }>> {
  if (!tagName.trim()) return { ok: false, error: "Tag name is required." };
  const supabase = await createClient();
  const { data: tag, error: tagError } = await supabase.rpc("get_or_create_tag", { p_name: tagName });
  if (tagError || !tag) return { ok: false, error: friendlyDbError(tagError) };
  const { error } = await supabase.from("roll_tags").insert({ roll_id: rollId, tag_id: tag.id });
  if (error && error.code !== "23505") return { ok: false, error: friendlyDbError(error) };
  revalidateRollSurfaces(rollId);
  return { ok: true, data: { tag: { id: tag.id, name: tag.name }, driveUpdates: await rollDriveUpdates(supabase, rollId) } };
}

/**
 * Removes a global tag from a roll. Only the roll_tags link is deleted; a
 * frame that was also given the same tag directly keeps it.
 */
export async function removeRollTag(
  rollId: string,
  tagId: string,
): Promise<ActionResult<{ driveUpdates: DriveTagUpdate[] }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("roll_tags").delete().eq("roll_id", rollId).eq("tag_id", tagId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidateRollSurfaces(rollId);
  return { ok: true, data: { driveUpdates: await rollDriveUpdates(supabase, rollId) } };
}

/**
 * Changes the roll's shared defaults. Frames that inherit pick the new value
 * up immediately; frames with their own lens/location are untouched (this
 * only ever updates the rolls row).
 */
export async function updateRollDefaults(
  rollId: string,
  input: { defaultLensId: string | null; locationName: string | null },
): Promise<ActionResult<{ driveUpdates: DriveTagUpdate[] }>> {
  const supabase = await createClient();
  const location = await resolveLocationId(supabase, input.locationName);
  if (!location.ok) return location;
  const { error } = await supabase
    .from("rolls")
    .update({ default_lens_id: input.defaultLensId, location_id: location.data })
    .eq("id", rollId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidateRollSurfaces(rollId);
  return { ok: true, data: { driveUpdates: await rollDriveUpdates(supabase, rollId) } };
}

/** completed -> archived. */
export async function archiveRoll(rollId: string): Promise<ActionResult<Roll>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_roll", { p_roll_id: rollId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong archiving the roll." };

  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);
  return { ok: true, data };
}

/** archived -> completed. */
export async function restoreRoll(rollId: string): Promise<ActionResult<Roll>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_roll", { p_roll_id: rollId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong restoring the roll." };

  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);
  return { ok: true, data };
}

/**
 * Manually edits a completed/archived roll's metadata — dates, custom title,
 * and notes together, since these are the archive-record fields a roll
 * shouldn't be permanently locked out of correcting after the fact. The
 * generated title has never been stored anywhere; it's computed fresh from
 * these columns on every render, so changing the dates or custom title here
 * is all that's needed for the displayed title to update — there's no
 * separate "title" field to keep in sync.
 */
export async function updateRollMetadata(
  rollId: string,
  input: {
    startDate: string;
    endDate: string | null;
    customTitle: string | null;
    notes: string | null;
  },
): Promise<ActionResult<Roll>> {
  if (!input.startDate) return { ok: false, error: "Start date is required." };
  if (input.endDate && input.endDate < input.startDate) {
    return { ok: false, error: "End date can't be before the start date." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rolls")
    .update({
      start_date: input.startDate,
      end_date: input.endDate,
      custom_title: input.customTitle,
      notes: input.notes,
    })
    .eq("id", rollId)
    .select()
    .single();

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong updating the dates." };

  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);
  return { ok: true, data };
}

/**
 * Permanently deletes a roll and, via the existing frames.roll_id ON DELETE
 * CASCADE (Phase 1 schema), every frame record that belongs to it. This is
 * only ever reachable from the roll detail page — see DeleteRollMenu — never
 * from the Active Roll shooting screen. Never touches Google Drive; there is
 * no Drive integration to call yet, and this only ever issues a Postgres
 * DELETE against our own tables.
 *
 * confirmationText must be exactly "DELETE" — the same requirement the UI
 * enforces before this is ever called, checked again here so a client bug or
 * a crafted request can't skip the safeguard.
 */
export async function deleteRoll(
  rollId: string,
  confirmationText: string,
): Promise<ActionResult<true>> {
  if (confirmationText !== "DELETE") {
    return { ok: false, error: 'Type "DELETE" exactly to confirm.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("rolls").delete().eq("id", rollId);
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath("/rolls");
  return { ok: true, data: true };
}

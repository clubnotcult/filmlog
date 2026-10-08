"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ArchiveRoot = { id: string; name: string };

/** Where the person's Drive archive lives (e.g. their "35mm" folder), or null if not chosen yet. */
export async function getArchiveRoot(): Promise<ActionResult<ArchiveRoot | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .select("drive_archive_root_id, drive_archive_root_name")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.drive_archive_root_id) return { ok: true, data: null };
  return {
    ok: true,
    data: { id: data.drive_archive_root_id, name: data.drive_archive_root_name ?? "Archive" },
  };
}

export async function saveArchiveRoot(root: ArchiveRoot): Promise<ActionResult<ArchiveRoot>> {
  if (!root.id.trim()) return { ok: false, error: "No folder was chosen." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Sign in again." };

  const { error } = await supabase.from("user_settings").upsert(
    { user_id: user.id, drive_archive_root_id: root.id, drive_archive_root_name: root.name },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/rolls/[id]", "page");
  return { ok: true, data: root };
}

export type DriveFolderLinkInput = {
  parentId: string;
  jpegId: string;
  rawId: string;
  selectsId: string;
};

/**
 * Stores the roll's Drive association. Called only after the whole structure
 * has been confirmed in Drive, so a roll is never left half-linked (the
 * database also enforces all-or-none). Compare-and-set on "not linked yet" and
 * "completed": if a second tab or a double tap got here first, this writes
 * nothing and says so rather than overwriting the first association.
 *
 * rolls.drive_folder_id (the SYNCED image folder) is deliberately not set here:
 * it keeps meaning "photos have been synced from this folder". The sync panel
 * uses drive_jpeg_folder_id as the folder to sync from, and the existing sync
 * then sets drive_folder_id exactly as it always has.
 */
export async function linkRollDriveFolders(
  rollId: string,
  input: DriveFolderLinkInput,
): Promise<ActionResult<{ alreadyLinked: boolean }>> {
  const ids = [input.parentId, input.jpegId, input.rawId, input.selectsId];
  if (ids.some((v) => !v || !v.trim())) {
    return { ok: false, error: "Drive folder details were incomplete, so nothing was saved." };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("rolls")
    .update({
      drive_parent_folder_id: input.parentId,
      drive_jpeg_folder_id: input.jpegId,
      drive_raw_folder_id: input.rawId,
      drive_selects_folder_id: input.selectsId,
    })
    .eq("id", rollId)
    .eq("status", "completed")
    .is("drive_parent_folder_id", null)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };

  if (!updated || updated.length === 0) {
    const { data: roll } = await supabase
      .from("rolls")
      .select("status, drive_parent_folder_id")
      .eq("id", rollId)
      .maybeSingle();
    if (!roll) return { ok: false, error: "That roll wasn't found." };
    if (roll.drive_parent_folder_id) return { ok: true, data: { alreadyLinked: true } };
    return { ok: false, error: "Drive folders can only be created for a completed roll." };
  }

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/rolls");
  return { ok: true, data: { alreadyLinked: false } };
}

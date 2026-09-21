"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { SyncMapping } from "@/lib/google-drive/types";
import type { RollSyncHistory } from "@/lib/database.types";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Writes a resolved sync (already confirmed by the person in the preview UI)
 * via the apply_roll_sync RPC — one atomic call that clears this roll's
 * existing image references, applies the new mapping, updates the roll's
 * remembered folder, and records a sync_history row. See the migration for
 * why a re-sync is a full replace rather than an upsert-in-place.
 *
 * The Google access token never reaches this function or the database —
 * only the already-resolved {frame_id, drive_file_id, ...} pairs do.
 */
export async function applyRollSync(
  rollId: string,
  folderId: string,
  folderName: string | null,
  mappings: SyncMapping[],
  frameCount: number,
  imageCount: number,
  countsMatch: boolean,
): Promise<ActionResult<RollSyncHistory>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("apply_roll_sync", {
    p_roll_id: rollId,
    p_drive_folder_id: folderId,
    p_drive_folder_name: folderName,
    p_mappings: mappings,
    p_frame_count: frameCount,
    p_image_count: imageCount,
    p_status: countsMatch ? "completed" : "completed_with_mismatch",
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong applying the sync." };

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/rolls");

  return { ok: true, data };
}

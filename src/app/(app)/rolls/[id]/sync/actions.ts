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
 * Refreshes ONLY the cached thumbnail/view URLs for frames that are already
 * synced to a known drive_file_id — never touches drive_file_id itself,
 * metadata_logged, exposure fields, or anything else. This is not a sync
 * event (no roll_sync_history row, no folder re-selection): it's transparent
 * maintenance for a well-documented Drive API behavior — thumbnailLink is a
 * short-lived URL ("typically lasts on the order of hours" per Google's own
 * field docs), while the drive_file_id that identifies the photo is
 * permanent. This just re-derives a fresh short-lived URL from the stable id
 * everything else already depends on.
 *
 * A plain loop of per-row updates (not a single RPC) is intentional here:
 * unlike apply_roll_sync, there's no correctness reason these need to land
 * atomically together — each frame's cached URL is independent, and RLS
 * already scopes every update to rows the caller owns.
 */
export async function refreshFrameImageLinks(
  rollId: string,
  updates: { frameId: string; thumbnailUrl: string | null; viewUrl: string | null }[],
): Promise<ActionResult<number>> {
  if (updates.length === 0) return { ok: true, data: 0 };

  const supabase = await createClient();
  let refreshed = 0;

  await Promise.all(
    updates.map(async (u) => {
      const { error, count } = await supabase
        .from("frames")
        .update(
          { drive_thumbnail_url: u.thumbnailUrl, drive_view_url: u.viewUrl },
          { count: "exact" },
        )
        .eq("id", u.frameId)
        .eq("roll_id", rollId);
      if (!error && count) refreshed += count;
    }),
  );

  revalidatePath(`/rolls/${rollId}`);

  return { ok: true, data: refreshed };
}

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

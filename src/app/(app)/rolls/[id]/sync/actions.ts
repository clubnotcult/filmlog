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

  // Revalidation root cause (previous version): this only told Next.js the
  // roll's OWN page was stale. A refreshed frame can also be visible on
  // Library, on Explore, and on its own frame-detail page — none of which
  // were ever told to invalidate, so whichever of those the person opened
  // next could still serve a cached render from before the refresh. Fixed by
  // revalidating every surface a refreshed thumbnail can appear on, not just
  // the one that triggered the refresh:
  //  - /rolls and /explore: plain paths, cheap, always relevant since a
  //    refresh can touch frames shown on either regardless of which one
  //    kicked it off (this matters once Library's global refresh exists).
  //  - the roll's own detail page, by its resolved path.
  //  - the frame-detail PAGE TEMPLATE via the bracketed dynamic-segment
  //    form, one call that covers every frame's detail page app-wide rather
  //    than resolving a path per refreshed frame — correct either way, but
  //    doesn't scale a revalidation call per frame as rolls get larger.
  revalidatePath("/rolls");
  revalidatePath("/explore");
  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/rolls/[id]/frames/[frameId]", "page");

  return { ok: true, data: refreshed };
}

export type SyncableRoll = {
  rollId: string;
  rollTitle: string;
  driveFolderId: string;
  frames: { id: string; drive_file_id: string | null }[];
};

/**
 * Every roll with a remembered Drive folder, for the Library's "Sync All" —
 * fetched only when that control is actually used, not on every Library or
 * Explore page view, since most visits don't need it. Archived rolls are
 * included deliberately: an archived roll's photos are still part of the
 * archive and still shown in Explore, so they still need working thumbnail
 * URLs. Only a roll's existing drive_folder_id and frames' existing
 * drive_file_ids are used — this never re-picks a folder or re-decides
 * frame order, exactly like the single-roll refresh it reuses.
 */
export async function listRollsForSync(): Promise<SyncableRoll[]> {
  const supabase = await createClient();

  const { data: rolls } = await supabase
    .from("rolls")
    .select("id, custom_title, drive_folder_id, start_date")
    .not("drive_folder_id", "is", null);
  if (!rolls || rolls.length === 0) return [];

  const rollIds = rolls.map((r) => r.id);
  const { data: frames } = await supabase
    .from("frames")
    .select("id, roll_id, drive_file_id")
    .in("roll_id", rollIds)
    .not("drive_file_id", "is", null);

  const framesByRoll = new Map<string, { id: string; drive_file_id: string | null }[]>();
  for (const f of frames ?? []) {
    const list = framesByRoll.get(f.roll_id) ?? [];
    list.push({ id: f.id, drive_file_id: f.drive_file_id });
    framesByRoll.set(f.roll_id, list);
  }

  return rolls
    .map((r) => ({
      rollId: r.id,
      rollTitle: r.custom_title || r.start_date,
      driveFolderId: r.drive_folder_id as string,
      frames: framesByRoll.get(r.id) ?? [],
    }))
    .filter((r) => r.frames.length > 0);
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

/**
 * Bulk-creates unlogged frames for a roll shot entirely outside the app —
 * one frame per Drive file, in the order they're given (already resolved to
 * natural filename order by the caller, the same ordering regular sync
 * uses). Only valid once, on a freshly created roll with zero frames — see
 * the import_roll_frames migration for why. The Google access token never
 * reaches this function; only the already-resolved file metadata does, same
 * as every other Drive-writing action in this app.
 */
export async function importRollFrames(
  rollId: string,
  driveFolderId: string,
  driveFolderName: string | null,
  files: { drive_file_id: string; drive_filename: string; drive_thumbnail_url: string | null; drive_view_url: string | null }[],
): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_roll_frames", {
    p_roll_id: rollId,
    p_drive_folder_id: driveFolderId,
    p_drive_folder_name: driveFolderName,
    p_files: files,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/rolls");
  return { ok: true, data: data?.length ?? 0 };
}

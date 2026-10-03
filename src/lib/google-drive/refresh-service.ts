import { listFolderJpegs } from "./files";
import { refreshFrameImageLinks } from "@/app/(app)/rolls/[id]/sync/actions";

export type RollImageRefreshResult =
  | { ok: true; rollId: string; updatedCount: number }
  | { ok: false; rollId: string; error: string };

/**
 * The one place that actually re-derives fresh Drive thumbnail/view URLs for
 * a roll from its already-stored drive_file_ids. Every refresh surface in
 * the app — the silent background refresh, the per-roll "Refresh Images"
 * button, and Library's "Sync All" — calls this same function rather than
 * each re-implementing "list the folder, match by file id, write the
 * update". The only thing that differs between those call sites is how they
 * obtain the access token (silent vs interactive) and how many rolls they
 * call this for — never the refresh logic itself.
 *
 * Deliberately does not re-fetch a token itself: a caller refreshing many
 * rolls at once should obtain ONE token and reuse it, not request a new one
 * per roll (wasteful, and a needless way to risk rate limiting against
 * Google's own token endpoint).
 *
 * Does not touch frame order, tags, favorites, evaluation, notes, locations,
 * or any other metadata — this writes exactly two columns
 * (drive_thumbnail_url, drive_view_url) and nothing else, using the stable
 * drive_file_id as the match key, never Drive's creation timestamp or
 * filename order (SmartConvert's filename order is only authoritative at
 * initial sync time, when frame_number assignments are first decided — a
 * refresh never re-decides those, it only re-derives a display URL for an
 * association that already exists).
 */
export async function refreshRollImages(
  accessToken: string,
  rollId: string,
  driveFolderId: string,
  frames: { id: string; drive_file_id: string | null }[],
): Promise<RollImageRefreshResult> {
  const syncedFrames = frames.filter(
    (f): f is { id: string; drive_file_id: string } => f.drive_file_id !== null,
  );
  if (syncedFrames.length === 0) return { ok: true, rollId, updatedCount: 0 };

  try {
    const files = await listFolderJpegs(accessToken, driveFolderId);
    const fileById = new Map(files.map((f) => [f.id, f]));

    const updates = syncedFrames
      .map((frame) => {
        const file = fileById.get(frame.drive_file_id);
        if (!file) return null;
        return { frameId: frame.id, thumbnailUrl: file.thumbnailLink, viewUrl: file.webViewLink };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    if (updates.length === 0) return { ok: true, rollId, updatedCount: 0 };

    const result = await refreshFrameImageLinks(rollId, updates);
    if (!result.ok) return { ok: false, rollId, error: result.error };
    return { ok: true, rollId, updatedCount: result.data };
  } catch (err) {
    return {
      ok: false,
      rollId,
      error: err instanceof Error ? err.message : "Couldn't refresh images.",
    };
  }
}

/**
 * Runs refreshRollImages across many rolls with bounded concurrency — safe,
 * well-behaved use of Drive's API rather than firing every roll's request
 * at once (which risks rate limiting at archive scale) or doing them one at
 * a time (needlessly slow once there are dozens of rolls). `onProgress` is
 * called after each roll settles, in whatever order they actually finish,
 * so a caller can show "N / total" without waiting for the whole batch.
 */
export async function refreshManyRolls(
  accessToken: string,
  rolls: {
    rollId: string;
    driveFolderId: string;
    frames: { id: string; drive_file_id: string | null }[];
  }[],
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number, result: RollImageRefreshResult) => void;
  } = {},
): Promise<RollImageRefreshResult[]> {
  const concurrency = options.concurrency ?? 4;
  const results: RollImageRefreshResult[] = [];
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < rolls.length) {
      const i = nextIndex++;
      const roll = rolls[i];
      const result = await refreshRollImages(
        accessToken,
        roll.rollId,
        roll.driveFolderId,
        roll.frames,
      );
      results[i] = result;
      completed++;
      options.onProgress?.(completed, rolls.length, result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, rolls.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

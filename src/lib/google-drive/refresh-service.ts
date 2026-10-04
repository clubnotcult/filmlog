import { listFolderJpegs } from "./files";
import { clearDriveToken } from "./auth";
import { classifyRefreshError, isTransientFailure, type RefreshFailureReason } from "./errors";
import { refreshFrameImageLinks } from "@/app/(app)/rolls/[id]/sync/actions";

export type RollImageRefreshResult =
  | {
      ok: true;
      rollId: string;
      updatedCount: number;
      /** Frames whose Drive file wasn't in the folder any more. Their links are left as they were. */
      missingCount: number;
    }
  | {
      ok: false;
      rollId: string;
      reason: RefreshFailureReason;
      error: string;
      /** True when this roll was skipped because an earlier one proved Google access had expired. */
      notAttempted?: boolean;
    };

export type RefreshServiceDeps = {
  listFiles: typeof listFolderJpegs;
  writeLinks: typeof refreshFrameImageLinks;
  /** Delays between retries of a transient Drive failure. */
  retryDelaysMs?: number[];
  /** Ceiling for one whole roll. */
  rollTimeoutMs?: number;
};

/**
 * The service takes its collaborators as parameters (and the module exports
 * a ready-made instance wired to the real Drive and database). That's purely
 * so the retry, timeout, empty-folder and de-duplication behaviour can be
 * exercised against stand-ins — those are exactly the paths that only occur
 * when Google or the network misbehaves.
 */
export function createRefreshService(deps: RefreshServiceDeps) {
  const ROLL_TIMEOUT_MS = deps.rollTimeoutMs ?? 60_000;
  const RETRY_DELAYS_MS = deps.retryDelaysMs ?? [600, 1800];

  /** Rolls refreshed recently this session, so automatic repair doesn't re-fetch what it just fixed. */
  const lastRefreshedAt = new Map<string, number>();
  function wasRefreshedRecently(rollId: string, withinMs: number): boolean {
    const at = lastRefreshedAt.get(rollId);
    return at !== undefined && Date.now() - at < withinMs;
  }

  /** Two callers asking for the same roll at once (a background repair and a tap) share one run. */
  const inflight = new Map<string, Promise<RollImageRefreshResult>>();

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async function listWithRetry(accessToken: string, folderId: string) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await deps.listFiles(accessToken, folderId);
      } catch (err) {
        lastError = err;
        // Only rate limits / outages / dropped connections are worth waiting
        // for. An expired token or a missing folder won't change by retrying.
        if (!isTransientFailure(err) || attempt === RETRY_DELAYS_MS.length) break;
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw lastError;
  }

  function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => resolve(onTimeout()), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  async function doRefresh(
    accessToken: string,
    rollId: string,
    driveFolderId: string,
    frames: { id: string; drive_file_id: string | null }[],
  ): Promise<RollImageRefreshResult> {
    const syncedFrames = frames.filter(
      (f): f is { id: string; drive_file_id: string } => f.drive_file_id !== null,
    );
    if (syncedFrames.length === 0) return { ok: true, rollId, updatedCount: 0, missingCount: 0 };

    try {
      const files = await listWithRetry(accessToken, driveFolderId);

      // Drive answers a list for a deleted/unreachable folder with an empty
      // 200, not a 404. Zero files for a folder we have synced frames in is a
      // problem to report, not a successful "nothing to update".
      if (files.length === 0) {
        return {
          ok: false,
          rollId,
          reason: "missing_folder",
          error: "The Drive folder is empty or no longer accessible.",
        };
      }

      const fileById = new Map(files.map((f) => [f.id, f]));
      const updates: { frameId: string; thumbnailUrl: string | null; viewUrl: string | null }[] = [];
      let missingCount = 0;
      for (const frame of syncedFrames) {
        const file = fileById.get(frame.drive_file_id);
        if (!file) {
          missingCount++;
          continue;
        }
        updates.push({ frameId: frame.id, thumbnailUrl: file.thumbnailLink, viewUrl: file.webViewLink });
      }

      if (updates.length === 0) {
        return { ok: true, rollId, updatedCount: 0, missingCount };
      }

      const result = await deps.writeLinks(rollId, updates);
      if (!result.ok) return { ok: false, rollId, reason: "failed", error: result.error };

      lastRefreshedAt.set(rollId, Date.now());
      return { ok: true, rollId, updatedCount: result.data, missingCount };
    } catch (err) {
      const { reason, message } = classifyRefreshError(err);
      // Google said the token is no good: stop reusing it, so the next attempt
      // re-authorizes instead of failing the same way for the rest of the hour.
      if (reason === "auth") clearDriveToken();
      return { ok: false, rollId, reason, error: message };
    }
  }

  /**
   * The one place that re-derives fresh Drive thumbnail/view URLs for a roll
   * from its already-stored drive_file_ids. Every refresh surface — automatic
   * repair, the per-roll button, the All Images refresh — goes through here.
   *
   * Writes exactly two columns (drive_thumbnail_url, drive_view_url), keyed by
   * the stable drive_file_id: never frame order, tags, selection, evaluation,
   * notes, locations, or the file/frame association itself. SmartConvert
   * filename order is decided once at sync time; a refresh never re-decides it.
   *
   * Guaranteed to resolve: transient failures are retried briefly, a hung
   * request is cut off, and the whole roll is bounded by a 60s ceiling.
   */
  function refreshRollImages(
    accessToken: string,
    rollId: string,
    driveFolderId: string,
    frames: { id: string; drive_file_id: string | null }[],
  ): Promise<RollImageRefreshResult> {
    const existing = inflight.get(rollId);
    if (existing) return existing;

    const run = withTimeout<RollImageRefreshResult>(
      doRefresh(accessToken, rollId, driveFolderId, frames),
      ROLL_TIMEOUT_MS,
      () => ({
        ok: false,
        rollId,
        reason: "transient",
        error: "Refreshing this roll took too long.",
      }),
    )
      .catch(
        (err): RollImageRefreshResult => ({
          ok: false,
          rollId,
          ...classifyRefreshError(err),
          error: classifyRefreshError(err).message,
        }),
      )
      .finally(() => {
        inflight.delete(rollId);
      });

    inflight.set(rollId, run);
    return run;
  }

  /**
   * Refreshes many rolls with bounded concurrency — well-behaved against
   * Drive's rate limits at archive scale rather than all-at-once or one-by-one.
   * One roll failing never stops the others, with one deliberate exception: if
   * a roll proves Google access has expired, every remaining roll would fail the
   * same way, so they are marked "not attempted" and the caller can offer a
   * single Reconnect instead of burning N identical failures.
   */
  async function refreshManyRolls(
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
    const concurrency = Math.max(1, options.concurrency ?? 4);
    const results: RollImageRefreshResult[] = new Array(rolls.length);
    let nextIndex = 0;
    let completed = 0;
    let authExpired = false;

    async function worker() {
      while (nextIndex < rolls.length) {
        const i = nextIndex++;
        const roll = rolls[i];

        let result: RollImageRefreshResult;
        if (authExpired) {
          result = {
            ok: false,
            rollId: roll.rollId,
            reason: "auth",
            error: "Not attempted — Google access expired.",
            notAttempted: true,
          };
        } else {
          result = await refreshRollImages(accessToken, roll.rollId, roll.driveFolderId, roll.frames);
          if (!result.ok && result.reason === "auth") authExpired = true;
        }

        results[i] = result;
        completed++;
        options.onProgress?.(completed, rolls.length, result);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, rolls.length) }, () => worker()));
    return results;
  }

  return { refreshRollImages, refreshManyRolls, wasRefreshedRecently };
}

const defaultService = createRefreshService({
  listFiles: listFolderJpegs,
  writeLinks: refreshFrameImageLinks,
});

export const refreshRollImages = defaultService.refreshRollImages;
export const refreshManyRolls = defaultService.refreshManyRolls;
export const wasRefreshedRecently = defaultService.wasRefreshedRecently;

import { DriveAuthError, type RefreshFailureReason } from "./errors";
import type { RollImageRefreshResult } from "./refresh-service";
import type { SyncableRoll } from "@/app/(app)/rolls/[id]/sync/actions";

/**
 * One refresh, start to finish, as a sequence of named stages. The UI renders
 * the stage; it never has to guess whether the app is working, waiting on the
 * person, or has failed — the previous single "Preparing…" could mean any of
 * those, and the one it usually meant was "waiting forever".
 */
export type RollIssueKind = RefreshFailureReason | "missing_files";

export type RollIssue = {
  rollId: string;
  rollTitle: string;
  kind: RollIssueKind;
  detail: string;
};

export type RefreshStage =
  | { kind: "idle" }
  | { kind: "authorizing" } // waiting on Google sign-in
  | { kind: "finding" } // reading which rolls have Drive folders
  | { kind: "refreshing"; completed: number; total: number }
  | { kind: "nothing" } // no roll has a synced folder
  | {
      kind: "done";
      updatedRolls: number;
      updatedImages: number;
      issues: RollIssue[];
    }
  | {
      kind: "needs_auth";
      message: string;
      updatedRolls: number;
      notAttempted: number;
    }
  | { kind: "failed"; message: string };

export type RefreshSource = { kind: "all" } | { kind: "rolls"; rolls: SyncableRoll[] };

export type RefreshDeps = {
  getToken: () => Promise<string>;
  listRolls: () => Promise<SyncableRoll[]>;
  refreshMany: (
    token: string,
    rolls: { rollId: string; driveFolderId: string; frames: SyncableRoll["frames"] }[],
    options: { concurrency?: number; onProgress?: (completed: number, total: number) => void },
  ) => Promise<RollImageRefreshResult[]>;
};

export async function runRefresh(
  source: RefreshSource,
  deps: RefreshDeps,
  onStage: (stage: RefreshStage) => void,
): Promise<RefreshStage> {
  const finish = (stage: RefreshStage) => {
    onStage(stage);
    return stage;
  };

  // 1. Google access FIRST, before any other await. The sign-in window can
  //    only be opened inside the tap that asked for it; the previous global
  //    refresh read the roll list from the server first, and by the time it
  //    asked Google the browser no longer treated the tap as current.
  onStage({ kind: "authorizing" });
  let token: string;
  try {
    token = await deps.getToken();
  } catch (err) {
    if (err instanceof DriveAuthError) {
      return finish({ kind: "needs_auth", message: err.message, updatedRolls: 0, notAttempted: 0 });
    }
    return finish({ kind: "failed", message: "Couldn't connect to Google Drive." });
  }

  // 2. Which rolls.
  let rolls: SyncableRoll[];
  if (source.kind === "rolls") {
    rolls = source.rolls;
  } else {
    onStage({ kind: "finding" });
    try {
      rolls = await deps.listRolls();
    } catch {
      return finish({ kind: "failed", message: "Couldn't load your rolls." });
    }
  }
  if (rolls.length === 0) return finish({ kind: "nothing" });

  // 3. Refresh, reporting progress as each roll settles.
  onStage({ kind: "refreshing", completed: 0, total: rolls.length });
  let results: RollImageRefreshResult[];
  try {
    results = await deps.refreshMany(
      token,
      rolls.map((r) => ({ rollId: r.rollId, driveFolderId: r.driveFolderId, frames: r.frames })),
      { concurrency: 4, onProgress: (completed, total) => onStage({ kind: "refreshing", completed, total }) },
    );
  } catch {
    return finish({ kind: "failed", message: "The refresh was interrupted." });
  }

  // 4. Summarize honestly: what worked, what needs attention, and why.
  const titleOf = new Map(rolls.map((r) => [r.rollId, r.rollTitle]));
  const issues: RollIssue[] = [];
  let updatedRolls = 0;
  let updatedImages = 0;
  let authExpired = false;
  let notAttempted = 0;

  for (const r of results) {
    const rollTitle = titleOf.get(r.rollId) ?? "Untitled roll";
    if (r.ok) {
      updatedRolls++;
      updatedImages += r.updatedCount;
      if (r.missingCount > 0) {
        issues.push({
          rollId: r.rollId,
          rollTitle,
          kind: "missing_files",
          detail: `${r.missingCount} file${r.missingCount === 1 ? "" : "s"} no longer in Drive`,
        });
      }
    } else if (r.notAttempted) {
      notAttempted++;
      authExpired = true;
    } else {
      if (r.reason === "auth") authExpired = true;
      else issues.push({ rollId: r.rollId, rollTitle, kind: r.reason, detail: r.error });
    }
  }

  if (authExpired) {
    return finish({
      kind: "needs_auth",
      message: "Google access expired.",
      updatedRolls,
      notAttempted,
    });
  }
  return finish({ kind: "done", updatedRolls, updatedImages, issues });
}

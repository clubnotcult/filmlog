import { classifyRefreshError, type RefreshFailureReason } from "./errors";
import {
  ensureRollFolderStructure,
  type DriveFolderApi,
  type EnsureStructureInput,
  type StructureIds,
  type StructureStep,
} from "./folders";

/**
 * Create the roll's Drive folders, then save the association — in that order,
 * and only if every folder was confirmed. This is the one place that decides
 * "Drive succeeded, now persist", so the rule that a roll is never left with a
 * half-built or unverified link lives (and is tested) in one spot.
 *
 * Failure handling:
 *   - Anything fails in Drive  -> nothing is saved. Folders already made are
 *     NOT deleted (destructive, and they'd be reused anyway): re-running finds
 *     them, so a retry completes the job without duplicates.
 *   - Drive fully succeeds but the save fails -> reported as such, with the
 *     same safe-retry guarantee.
 */

export type LinkResult = { ok: true; data: { alreadyLinked: boolean } } | { ok: false; error: string };

export type CreateRollFoldersOutcome =
  | { kind: "linked"; ids: StructureIds; steps: StructureStep[]; warnings: string[]; adopted: boolean; alreadyLinked: boolean }
  | {
      kind: "failed";
      /** auth = reconnect Google; root_missing = choose the archive folder again. */
      problem: RefreshFailureReason | "root_missing" | "conflict" | "not_saved";
      message: string;
      steps: StructureStep[];
    };

export async function createAndLinkRollFolders(deps: {
  api: DriveFolderApi;
  input: EnsureStructureInput;
  link: (ids: StructureIds) => Promise<LinkResult>;
}): Promise<CreateRollFoldersOutcome> {
  const result = await ensureRollFolderStructure(deps.api, deps.input);

  if (!result.ok) {
    if (result.reason === "drive_error") {
      const { reason, message } = classifyRefreshError(result.cause);
      return { kind: "failed", problem: reason, message, steps: result.steps };
    }
    return { kind: "failed", problem: result.reason, message: result.message, steps: result.steps };
  }

  const saved = await deps.link(result.ids);
  if (!saved.ok) {
    return {
      kind: "failed",
      problem: "not_saved",
      message: `The folders are in Drive, but couldn't be saved to this roll (${saved.error}). Try again — nothing will be duplicated.`,
      steps: result.steps,
    };
  }

  return {
    kind: "linked",
    ids: result.ids,
    steps: result.steps,
    warnings: result.warnings,
    adopted: result.adopted,
    alreadyLinked: saved.data.alreadyLinked,
  };
}

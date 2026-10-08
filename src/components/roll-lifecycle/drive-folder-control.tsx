"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearDriveToken,
  createAndLinkRollFolders,
  createDriveFolderApi,
  getDriveAccessToken,
  hasGoogleDriveEnv,
  pickDriveFolder,
} from "@/lib/google-drive";
import type { StructureStep } from "@/lib/google-drive";
import {
  linkRollDriveFolders,
  saveArchiveRoot,
  type ArchiveRoot,
} from "@/app/(app)/rolls/[id]/drive/actions";

type Failure = { message: string; steps: StructureStep[]; needsRoot: boolean };

const OUTCOME_MARK: Record<StructureStep["outcome"], string> = {
  found: "✓",
  created: "✓",
  skipped: "–",
  failed: "✕",
  not_attempted: "·",
};

const buttonClass =
  "label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-40";

/**
 * "Create Drive Folder" for a completed roll that has none yet. The page only
 * renders this when it applies (completed, not yet linked); once it succeeds the
 * page re-renders in its linked state ("Folder Created · Open in Drive").
 *
 * Google's window is opened by the first await in each tap (see
 * getDriveAccessToken), then — only if no archive folder is saved yet — the
 * Picker asks for it once. That choice is stored, so it is a one-time step.
 */
export function DriveFolderControl({
  rollId,
  folderName,
  year,
  archiveRoot,
  existingImageFolderId,
}: {
  rollId: string;
  /** Name the roll folder will get, e.g. 9.28_10.2_JHCStreetPan_ATX. */
  folderName: string;
  year: string;
  archiveRoot: ArchiveRoot | null;
  /** The roll's already-synced image folder, if any: it is adopted rather than duplicated. */
  existingImageFolderId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [root, setRoot] = useState<ArchiveRoot | null>(archiveRoot);
  const configured = hasGoogleDriveEnv();

  async function chooseRoot(token: string): Promise<ArchiveRoot | null> {
    const picked = await pickDriveFolder(token, "Choose your 35mm archive folder");
    if (!picked) return null;
    const saved = await saveArchiveRoot({ id: picked.id, name: picked.name });
    if (!saved.ok) throw new Error(saved.error);
    setRoot(saved.data);
    return saved.data;
  }

  function fail(message: string, steps: StructureStep[] = [], needsRoot = false) {
    setFailure({ message, steps, needsRoot });
  }

  async function create(forceChooseRoot = false) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      // First await: keeps this tap's permission to open Google's sign-in window.
      const token = await getDriveAccessToken();

      let target = forceChooseRoot ? null : root;
      if (!target) {
        target = await chooseRoot(token);
        if (!target) return; // cancelled the picker — not an error
      }

      const outcome = await createAndLinkRollFolders({
        api: createDriveFolderApi(token),
        input: { rootFolderId: target.id, year, folderName, existingImageFolderId },
        link: (ids) =>
          linkRollDriveFolders(rollId, {
            parentId: ids.parent,
            jpegId: ids.jpeg,
            rawId: ids.raw,
            selectsId: ids.selects,
          }),
      });

      if (outcome.kind === "linked") {
        router.refresh();
        return;
      }
      if (outcome.problem === "auth") {
        // Google rejected the token (expired, or issued before write access was
        // granted). Drop it so the next tap asks Google again.
        clearDriveToken();
        fail(
          "Google didn't allow that. Tap Create Drive Folder again to reconnect — you may be asked to approve Drive access once.",
          outcome.steps,
        );
      } else {
        fail(outcome.message, outcome.steps, outcome.problem === "root_missing");
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong connecting to Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRoot() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await chooseRoot(await getDriveAccessToken());
    } catch (err) {
      fail(err instanceof Error ? err.message : "Couldn't change the archive folder.");
    } finally {
      setBusy(false);
    }
  }

  const hint = existingImageFolderId
    ? "Adds RAW and SELECTS next to this roll's existing photos folder."
    : root
      ? `Creates ${root.name} / ${year} / ${folderName}, with RAW, JPEG and SELECTS.`
      : "You'll choose your 35mm archive folder once.";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => create(false)}
          disabled={!configured || busy}
          title={configured ? undefined : "Google Drive is not configured for this deployment"}
          className={buttonClass}
        >
          {busy ? "Working…" : "Create Drive Folder"}
        </button>
        {root && !existingImageFolderId && (
          <button
            type="button"
            onClick={changeRoot}
            disabled={!configured || busy}
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
          >
            Change archive folder
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{hint}</p>

      {failure && (
        <div className="space-y-2 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2">
          <p className="text-xs text-danger">{failure.message}</p>
          {failure.steps.some((s) => s.outcome !== "not_attempted") && (
            <ul className="space-y-0.5 font-mono text-xs text-muted-strong">
              {failure.steps
                .filter((s) => s.key !== "archive_root" || s.outcome === "failed")
                .map((s) => (
                  <li key={s.key}>
                    {OUTCOME_MARK[s.outcome]} {s.label}
                    {s.outcome === "created" && " — created"}
                    {s.outcome === "found" && " — already there"}
                    {s.outcome === "failed" && " — failed"}
                  </li>
                ))}
            </ul>
          )}
          {failure.steps.some((s) => s.outcome === "created") && (
            <p className="text-xs text-muted">
              Folders already made are kept. Trying again continues from here without duplicating them.
            </p>
          )}
          {failure.needsRoot && (
            <button type="button" onClick={() => create(true)} disabled={busy} className={buttonClass}>
              Choose archive folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}

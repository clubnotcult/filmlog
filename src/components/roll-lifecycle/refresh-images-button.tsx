"use client";

import { useEffect } from "react";
import { preloadDriveAuth } from "@/lib/google-drive/auth";
import { describeStage } from "@/lib/google-drive/describe-stage";
import { useDriveRefresh } from "./use-drive-refresh";

const TONE = { muted: "text-muted", accent: "text-accent", danger: "text-danger" } as const;

/**
 * Refreshes this one roll's image links using the same hook, service and
 * wording as the All Images refresh. A deliberately lighter action than "Sync
 * Photos": no folder picker, no preview, no sync-history entry.
 *
 * `variant="link"` is the small inline form used where an image failed to
 * load; `"button"` is the bordered form on the roll page.
 */
export function RefreshImagesButton({
  rollId,
  driveFolderId,
  frames,
  variant = "button",
}: {
  rollId: string;
  driveFolderId: string;
  frames: { id: string; drive_file_id: string | null }[];
  variant?: "button" | "link";
}) {
  const { stage, start, isUpdating } = useDriveRefresh();

  useEffect(() => {
    preloadDriveAuth();
  }, []);

  if (!frames.some((f) => f.drive_file_id !== null)) return null;

  const view = describeStage(stage, { isUpdating, authNeeded: false, failedCount: 0 });
  const label = view.busy ? (view.text ?? "Working…") : (view.action ?? "Refresh images");
  // Result text (e.g. "1 roll refreshed", "Google access expired.") sits under the button.
  const resultText = !view.busy && stage.kind !== "idle" ? view.text : null;

  function handleClick() {
    start({
      kind: "rolls",
      rolls: [{ rollId, rollTitle: "This roll", driveFolderId, frames }],
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={view.busy}
        onClick={handleClick}
        className={
          variant === "link"
            ? "label !text-accent hover:underline disabled:opacity-60"
            : "label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-60"
        }
      >
        {label}
      </button>
      {resultText && (
        <p role="status" className={`mt-1 text-xs ${TONE[view.tone]}`}>
          {resultText}
        </p>
      )}
    </div>
  );
}

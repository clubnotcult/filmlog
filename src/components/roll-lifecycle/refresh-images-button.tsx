"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDriveAccessToken } from "@/lib/google-drive/auth";
import { refreshRollImages } from "@/lib/google-drive/refresh-service";

/**
 * A deliberately lighter action than "Sync Photos": no folder picker, no
 * preview/confirm step, no sync-history entry — it just calls the shared
 * refreshRollImages service for this one roll. The manual fallback for when
 * the automatic background refresh (SilentImageRefresh) couldn't run
 * silently — e.g. the browser has no active Google session right now, so an
 * interactive consent prompt is acceptable here (the person tapped this on
 * purpose) where it wouldn't be for the silent background version.
 */
export function RefreshImagesButton({
  rollId,
  driveFolderId,
  frames,
}: {
  rollId: string;
  driveFolderId: string;
  frames: { id: string; drive_file_id: string | null }[];
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const syncedFrames = frames.filter(
    (f): f is { id: string; drive_file_id: string } => f.drive_file_id !== null,
  );

  if (syncedFrames.length === 0) return null;

  async function handleClick() {
    setState("working");
    setError(null);
    try {
      const token = await getDriveAccessToken();
      const result = await refreshRollImages(token, rollId, driveFolderId, frames);
      if (!result.ok) {
        setError(result.error);
        setState("error");
        return;
      }
      setState("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't refresh images.");
      setState("error");
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={state === "working"}
        onClick={handleClick}
        className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50"
      >
        {state === "working" ? "Refreshing…" : state === "done" ? "Refreshed" : "Refresh Images"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDriveAccessToken } from "@/lib/google-drive/auth";
import { listFolderJpegs } from "@/lib/google-drive/files";
import { refreshFrameImageLinks } from "@/app/(app)/rolls/[id]/sync/actions";

/**
 * A deliberately lighter action than "Sync Photos": no folder picker, no
 * preview/confirm step, no sync-history entry — it just re-derives fresh
 * thumbnail/view URLs from the drive_file_ids already on record, using the
 * folder this roll is already associated with. The manual fallback for when
 * the automatic background refresh (SilentImageRefresh) couldn't run
 * silently — e.g. the browser has no active Google session right now.
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
      const files = await listFolderJpegs(token, driveFolderId);
      const fileById = new Map(files.map((f) => [f.id, f]));

      const updates = syncedFrames
        .map((frame) => {
          const file = fileById.get(frame.drive_file_id);
          if (!file) return null;
          return { frameId: frame.id, thumbnailUrl: file.thumbnailLink, viewUrl: file.webViewLink };
        })
        .filter((u): u is NonNullable<typeof u> => u !== null);

      const result = await refreshFrameImageLinks(rollId, updates);
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
        className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-50"
      >
        {state === "working" ? "Refreshing…" : state === "done" ? "Refreshed" : "Refresh Images"}
      </button>
      {error && <p className="mt-1 text-xs text-fd-red">{error}</p>}
    </div>
  );
}

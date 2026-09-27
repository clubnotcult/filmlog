"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDriveAccessToken,
  pickDriveFolder,
  listFolderJpegs,
  buildSyncPreview,
  hasGoogleDriveEnv,
} from "@/lib/google-drive";
import type { SyncPreview } from "@/lib/google-drive/types";
import { applyRollSync } from "@/app/(app)/rolls/[id]/sync/actions";

type Stage =
  | "idle"
  | "working"
  | "preview"
  | "applying"
  | "done"
  | "error";

export function SyncPhotosPanel({
  rollId,
  frames,
}: {
  rollId: string;
  frames: { id: string; frame_number: number }[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(null);

  const configured = hasGoogleDriveEnv();

  function close() {
    setStage("idle");
    setError(null);
    setPreview(null);
    setFolder(null);
  }

  async function startSync() {
    setStage("working");
    setError(null);
    try {
      const token = await getDriveAccessToken();
      const picked = await pickDriveFolder(token);
      if (!picked) {
        // Person cancelled the picker — quietly return to idle, not an error.
        setStage("idle");
        return;
      }
      setFolder(picked);
      const files = await listFolderJpegs(token, picked.id);
      const built = buildSyncPreview(frames, files);
      setPreview(built);
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong connecting to Google Drive.");
      setStage("error");
    }
  }

  async function confirmSync() {
    if (!preview || !folder) return;
    setStage("applying");
    setError(null);

    const mappings = preview.pairs.map((pair) => ({
      frame_id: pair.frameId,
      drive_file_id: pair.file.id,
      drive_filename: pair.file.name,
      drive_thumbnail_url: pair.file.thumbnailLink,
      drive_view_url: pair.file.webViewLink,
    }));

    const result = await applyRollSync(
      rollId,
      folder.id,
      folder.name,
      mappings,
      preview.frameCount,
      preview.imageCount,
      preview.countsMatch,
    );

    if (!result.ok) {
      setError(result.error);
      setStage("error");
      return;
    }

    setStage("done");
    router.refresh();
  }

  if (stage === "idle") {
    return (
      <button
        type="button"
        onClick={startSync}
        disabled={!configured}
        title={configured ? undefined : "Google Drive is not configured for this deployment"}
        className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-40"
      >
        Sync Photos
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface-raised px-4 py-3">
      {stage === "working" && (
        <p className="text-sm text-muted">Connecting to Google Drive…</p>
      )}

      {stage === "preview" && preview && folder && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            <span className="font-mono">{preview.frameCount}</span> frames logged ·{" "}
            <span className="font-mono">{preview.imageCount}</span> JPEGs found in &ldquo;{folder.name}&rdquo;
          </p>

          {!preview.countsMatch && (
            <p className="rounded-md border border-fd-red/40 bg-fd-red/10 px-3 py-2 text-xs text-fd-red">
              Frame and image counts don&apos;t match.{" "}
              {preview.unmatchedFrameNumbers.length > 0 &&
                `Frame${preview.unmatchedFrameNumbers.length === 1 ? "" : "s"} ${preview.unmatchedFrameNumbers.join(", ")} will have no image.`}{" "}
              {preview.unmatchedFileNames.length > 0 &&
                `${preview.unmatchedFileNames.length} extra file(s) will not be attached to anything.`}{" "}
              Review carefully before confirming.
            </p>
          )}

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
            {preview.pairs.map((pair) => (
              <div key={pair.frameId} className="flex justify-between gap-2 text-muted-strong">
                <span className="shrink-0">Frame {pair.frameNumber}</span>
                <span className="min-w-0 truncate text-muted">{pair.file.name}</span>
              </div>
            ))}
            {preview.unmatchedFrameNumbers.map((n) => (
              <div key={`unmatched-frame-${n}`} className="flex justify-between gap-2 text-fd-red/80">
                <span>Frame {n}</span>
                <span>— no image —</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSync}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black"
            >
              Confirm Sync
            </button>
          </div>
        </div>
      )}

      {stage === "applying" && <p className="text-sm text-muted">Applying sync…</p>}

      {stage === "done" && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground">Sync complete.</p>
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
          >
            Close
          </button>
        </div>
      )}

      {stage === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-fd-red">{error}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
            >
              Close
            </button>
            <button
              type="button"
              onClick={startSync}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

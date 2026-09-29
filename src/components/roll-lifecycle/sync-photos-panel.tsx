"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDriveAccessToken,
  pickDriveFolder,
  listFolderJpegs,
  buildSyncPreview,
  hasGoogleDriveEnv,
  pushTagsToDrive,
} from "@/lib/google-drive";
import type { SyncPreview } from "@/lib/google-drive/types";
import { applyRollSync } from "@/app/(app)/rolls/[id]/sync/actions";
import { frameTagNames } from "@/app/(app)/rolls/[id]/frames/actions";
import { computeSystemTags, combineTagsForDrive } from "@/lib/tags/system-tags";

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
  filmStockName,
  format,
  cameraName,
  lensNameById,
}: {
  rollId: string;
  frames: { id: string; frame_number: number; lens_id: string | null }[];
  filmStockName: string | null;
  format: string | null;
  cameraName: string | null;
  lensNameById: Map<string, string>;
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

    // Best-effort, in the background — seeds every newly-synced photo's
    // Drive description with its system tags (format, film stock, camera,
    // lens) plus whatever user tags it already has, so Drive's own search
    // finds it immediately without waiting for someone to open and tag it
    // by hand. Never blocks the sync UI, and a failure here doesn't affect
    // the sync itself — the frame/image association is already saved.
    void (async () => {
      for (const pair of preview.pairs) {
        const frame = frames.find((f) => f.id === pair.frameId);
        if (!frame) continue;
        const systemTags = computeSystemTags({
          filmStockName,
          format,
          cameraName,
          lensName: frame.lens_id ? (lensNameById.get(frame.lens_id) ?? null) : null,
        });
        const userTags = await frameTagNames(pair.frameId);
        void pushTagsToDrive(pair.file.id, combineTagsForDrive(systemTags, userTags));
      }
    })();
  }

  if (stage === "idle") {
    return (
      <button
        type="button"
        onClick={startSync}
        disabled={!configured}
        title={configured ? undefined : "Google Drive is not configured for this deployment"}
        className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-40"
      >
        Sync Photos
      </button>
    );
  }

  return (
    <div className="border-y border-border py-3">
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
            <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              Frame and image counts don&apos;t match.{" "}
              {preview.unmatchedFrameNumbers.length > 0 &&
                `Frame${preview.unmatchedFrameNumbers.length === 1 ? "" : "s"} ${preview.unmatchedFrameNumbers.join(", ")} will have no image.`}{" "}
              {preview.unmatchedFileNames.length > 0 &&
                `${preview.unmatchedFileNames.length} extra file(s) will not be attached to anything.`}{" "}
              Review carefully before confirming.
            </p>
          )}

          <div className="max-h-64 space-y-1 overflow-y-auto border-y border-border py-2 text-xs">
            {preview.pairs.map((pair) => (
              <div key={pair.frameId} className="flex justify-between gap-2 text-muted-strong">
                <span className="shrink-0">Frame {pair.frameNumber}</span>
                <span className="min-w-0 truncate text-muted">{pair.file.name}</span>
              </div>
            ))}
            {preview.unmatchedFrameNumbers.map((n) => (
              <div key={`unmatched-frame-${n}`} className="flex justify-between gap-2 text-danger/80">
                <span>Frame {n}</span>
                <span>— no image —</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSync}
              className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
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
            className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground"
          >
            Close
          </button>
        </div>
      )}

      {stage === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-danger">{error}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground"
            >
              Close
            </button>
            <button
              type="button"
              onClick={startSync}
              className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

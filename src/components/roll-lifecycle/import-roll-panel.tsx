"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDriveAccessToken,
  pickDriveFolder,
  listFolderJpegs,
  orderDriveFiles,
  hasGoogleDriveEnv,
} from "@/lib/google-drive";
import { importRollFrames } from "@/app/(app)/rolls/[id]/sync/actions";
import type { DriveJpegFile } from "@/lib/google-drive/types";

type Stage = "idle" | "picking" | "preview" | "importing" | "error";

/**
 * For a roll shot entirely outside the app: pick the Drive folder with the
 * scans, and one unlogged frame is created per image, in natural filename
 * order — no per-frame exposure to log, since none of it was ever recorded.
 * Only shown for a freshly created roll with no frames yet (see the roll
 * detail page) — import_roll_frames itself also refuses a roll that already
 * has frames, so this can't be run twice by accident.
 */
export function ImportRollPanel({ rollId }: { rollId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(null);
  const [files, setFiles] = useState<DriveJpegFile[]>([]);

  const configured = hasGoogleDriveEnv();

  async function pickFolder() {
    setStage("picking");
    setError(null);
    try {
      const token = await getDriveAccessToken();
      const picked = await pickDriveFolder(token);
      if (!picked) {
        setStage("idle");
        return;
      }
      const rawFiles = await listFolderJpegs(token, picked.id);
      const ordered = orderDriveFiles(rawFiles);
      if (ordered.length === 0) {
        setError("No JPEGs found in that folder.");
        setStage("error");
        return;
      }
      setFolder(picked);
      setFiles(ordered);
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong connecting to Google Drive.");
      setStage("error");
    }
  }

  async function confirmImport() {
    if (!folder) return;
    setStage("importing");
    setError(null);
    const result = await importRollFrames(
      rollId,
      folder.id,
      folder.name,
      files.map((f) => ({
        drive_file_id: f.id,
        drive_filename: f.name,
        drive_thumbnail_url: f.thumbnailLink,
        drive_view_url: f.webViewLink,
      })),
    );
    if (!result.ok) {
      setError(result.error);
      setStage("error");
      return;
    }
    router.push(`/rolls/${rollId}`);
    router.refresh();
  }

  if (!configured) return null;

  if (stage === "idle" || stage === "picking") {
    return (
      <button
        type="button"
        disabled={stage === "picking"}
        onClick={pickFolder}
        className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50"
      >
        {stage === "picking" ? "Opening Drive…" : "Import from Drive Folder"}
      </button>
    );
  }

  if (stage === "preview") {
    return (
      <div className="border-y border-border py-4">
        <p className="text-sm text-foreground">
          {files.length} image{files.length === 1 ? "" : "s"} found in &ldquo;{folder?.name}&rdquo;.
        </p>
        <p className="mt-1 text-xs text-muted">
          Each will become one frame, in filename order, with exposure marked
          unknown — nothing to log since none of it was recorded.
        </p>
        <div className="mt-3 flex gap-4">
          <button
            type="button"
            onClick={confirmImport}
            className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
          >
            Import {files.length} Frames
          </button>
          <button
            type="button"
            onClick={() => {
              setStage("idle");
              setFolder(null);
              setFiles([]);
            }}
            className="label hover:!text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (stage === "importing") {
    return <p className="text-sm text-muted">Importing…</p>;
  }

  return (
    <div>
      <p className="text-sm text-danger">{error}</p>
      <button
        type="button"
        onClick={() => setStage("idle")}
        className="label mt-2 hover:!text-foreground"
      >
        Try again
      </button>
    </div>
  );
}

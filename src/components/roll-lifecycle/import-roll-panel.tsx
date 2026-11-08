"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDriveAccessToken, hasGoogleDriveEnv, pushTagsToDrive } from "@/lib/google-drive";
import { pickImageSource, readLinkedImageSource, type ImageSource } from "@/lib/google-drive/image-source";
import { importRollImages, type ImportResult } from "@/app/(app)/rolls/[id]/sync/actions";

type Stage = "idle" | "reading" | "preview" | "importing" | "done" | "error";

/** Best-effort, in the background: write each image's full tag set into its Drive description. */
export function pushDriveUpdates(updates: { driveFileId: string; tags: string[] }[]) {
  void (async () => {
    for (const u of updates) await pushTagsToDrive(u.driveFileId, u.tags);
  })();
}

/** What an import of `source` would do to a roll that already holds `existingFileIds`. */
export function planImport(source: ImageSource, existingFileIds: Set<string>, lastFrameNumber: number) {
  let next = lastFrameNumber;
  const added = source.files
    .filter((f) => !existingFileIds.has(f.id))
    .map((f) => ({ frameNumber: ++next, file: f }));
  const sourceIds = new Set(source.files.map((f) => f.id));
  const missing = [...existingFileIds].filter((id) => !sourceIds.has(id)).length;
  return { added, kept: source.files.length - added.length, missing };
}

export function importPayload(source: ImageSource) {
  return source.files.map((f) => ({
    drive_file_id: f.id,
    drive_filename: f.name,
    drive_thumbnail_url: f.thumbnailLink,
    drive_view_url: f.webViewLink,
  }));
}

/**
 * Imports a Drive JPEG folder into a roll — one frame per image, created
 * automatically in SmartConvert filename order — or refreshes a roll that
 * was imported before (new images appended, existing frames untouched).
 * Always previews first, so nothing changes until Import is pressed.
 */
export function ImportRollPanel({
  rollId,
  linkedFolderId,
  existingFileIds,
  lastFrameNumber,
}: {
  rollId: string;
  /** The roll's image folder, if it has one: refresh reads it directly; a different folder can still be chosen. */
  linkedFolderId: string | null;
  existingFileIds: string[];
  lastFrameNumber: number;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ImageSource | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!hasGoogleDriveEnv()) return null;

  const existing = new Set(existingFileIds);
  const isRefresh = existingFileIds.length > 0;

  async function read(pick: boolean) {
    setStage("reading");
    setError(null);
    try {
      // Token first: it may open Google's window, which browsers only allow inside the tap.
      const token = await getDriveAccessToken();
      const found = !pick && linkedFolderId ? await readLinkedImageSource(token, linkedFolderId) : await pickImageSource(token);
      if (!found) {
        setStage("idle");
        return;
      }
      if (found.files.length === 0) {
        setError(`No JPEGs found in “${found.folder.name}”.`);
        setStage("error");
        return;
      }
      setSource(found);
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong connecting to Google Drive.");
      setStage("error");
    }
  }

  async function confirm() {
    if (!source) return;
    setStage("importing");
    const res = await importRollImages(rollId, source.folder.id, source.folder.name, importPayload(source));
    if (!res.ok) {
      setError(res.error);
      setStage("error");
      return;
    }
    setResult(res.data);
    setStage("done");
    pushDriveUpdates(res.data.driveUpdates);
    router.refresh();
  }

  const quiet = "label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50";
  const primary = "numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black";

  if (stage === "idle" || stage === "reading") {
    return (
      <div className="flex flex-wrap gap-2">
        {linkedFolderId && (
          <button type="button" disabled={stage === "reading"} onClick={() => read(false)} className={quiet}>
            {stage === "reading" ? "Reading Drive…" : isRefresh ? "Check for new images" : "Import images"}
          </button>
        )}
        <button
          type="button"
          disabled={stage === "reading"}
          onClick={() => read(true)}
          className={linkedFolderId ? quiet : primary}
        >
          {stage === "reading" && !linkedFolderId ? "Opening Drive…" : linkedFolderId ? "Choose folder…" : "Import images from Drive"}
        </button>
      </div>
    );
  }

  if (stage === "preview" && source) {
    const plan = planImport(source, existing, lastFrameNumber);
    return (
      <div className="w-full border-y border-border py-4">
        <p className="text-sm text-foreground">
          <span className="numeral">{source.files.length}</span> JPEG{source.files.length === 1 ? "" : "s"} in &ldquo;{source.folder.name}&rdquo;
          {isRefresh && (
            <span className="text-muted">
              {" "}· {plan.kept} already in this roll · {plan.added.length} new
              {plan.missing > 0 && ` · ${plan.missing} no longer in Drive (kept)`}
            </span>
          )}
        </p>
        {plan.added.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-muted">
              One frame per image, in filename order. Exposure stays unknown; roll defaults and tags apply automatically.
            </p>
            <ol className="mt-3 max-h-56 space-y-1 overflow-y-auto border-y border-border py-2 text-xs">
              {plan.added.map(({ frameNumber, file }) => (
                <li key={file.id} className="flex justify-between gap-3 text-muted-strong">
                  <span className="numeral shrink-0">Frame {String(frameNumber).padStart(2, "0")}</span>
                  <span className="min-w-0 truncate font-mono text-muted">{file.name}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted">Nothing new — every image already has its frame.</p>
        )}
        <div className="mt-3 flex gap-4">
          <button type="button" onClick={confirm} className={primary}>
            {plan.added.length > 0 ? `Import ${plan.added.length} frame${plan.added.length === 1 ? "" : "s"}` : "Refresh links"}
          </button>
          <button type="button" onClick={() => setStage("idle")} className="label hover:!text-foreground">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (stage === "importing") return <p className="text-sm text-muted">Importing…</p>;

  if (stage === "done" && result) {
    return (
      <p className="text-sm text-muted-strong">
        {result.created > 0 ? `${result.created} frame${result.created === 1 ? "" : "s"} added.` : "No new images."}
        {result.missing > 0 && ` ${result.missing} image${result.missing === 1 ? " is" : "s are"} no longer in Drive; their frames were kept.`}{" "}
        <button type="button" onClick={() => setStage("idle")} className="label ml-2 hover:!text-foreground">
          OK
        </button>
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-danger">{error}</p>
      <button type="button" onClick={() => setStage("idle")} className="label mt-2 hover:!text-foreground">
        Try again
      </button>
    </div>
  );
}

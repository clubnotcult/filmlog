"use client";

import { useState } from "react";
import Link from "next/link";
import { formatExposureSummary } from "@/lib/exposure-format";
import { SelectionMark } from "@/components/frame-organization/selection-mark";
import { driveThumbnailAtSize, GRID_THUMBNAIL_SIZE } from "@/lib/google-drive";
import type { Frame } from "@/lib/database.types";

/**
 * A single frame in the roll's grid browser. Shows the synced Drive
 * thumbnail when one exists; otherwise the same placeholder used before any
 * syncing existed. A thumbnail URL that fails to load (expired, revoked
 * access, etc.) falls back to the placeholder rather than a broken-image
 * icon — the grid must stay usable across fully synced, partially synced,
 * and unsynced rolls without knowing in advance which frames have images.
 *
 * `selectable` turns the card into a bulk-tagging checkbox target instead of
 * a link to the frame detail page — used by the roll detail page's "select
 * frames to tag" mode, so applying a tag to many frames never requires
 * opening each one individually.
 */
export function FrameCard({
  frame,
  lensLabel,
  href,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  frame: Frame;
  lensLabel: string | null;
  href: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (frameId: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);

  const summary = frame.metadata_logged
    ? formatExposureSummary(frame, lensLabel)
    : null;

  const showImage = Boolean(frame.drive_thumbnail_url) && !imageFailed;

  const content = (
    <>
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable Drive URL
          <img
            src={
              triedFallback
                ? frame.drive_thumbnail_url!
                : driveThumbnailAtSize(frame.drive_thumbnail_url!, GRID_THUMBNAIL_SIZE)
            }
            alt={`Frame ${frame.frame_number}`}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => {
              if (!triedFallback) setTriedFallback(true);
              else setImageFailed(true);
            }}
          />
        ) : (
          <span className="font-mono text-xs text-muted">No photo yet</span>
        )}
        <SelectionMark selection={frame.selection} />
        {selectable && (
          <span
            className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
              selected
                ? "border-accent bg-accent text-black"
                : "border-border bg-background/80 text-transparent"
            }`}
          >
            ✓
          </span>
        )}
      </div>
      {/* Filename is the card's title — the literal identity of the scan, so
          it can be matched to the raw file. Everything else is supporting.
          (Film stock and camera are omitted here: every card in a roll shares
          them, and the roll header already says so.) Frames with no synced
          image yet have no filename, so they fall back to their number. */}
      <div className="px-2.5 py-2">
        <p
          className="truncate font-mono text-xs text-foreground"
          title={frame.drive_filename ?? undefined}
        >
          {frame.drive_filename ?? `Frame ${frame.frame_number}`}
        </p>
        <p className="mt-0.5 flex items-center justify-between gap-1 truncate font-mono text-[11px] text-muted">
          <span className="truncate">
            #{frame.frame_number}
            {summary ? ` · ${summary}` : " · no exposure data"}
          </span>
          {frame.notes && (
            <span className="shrink-0 text-[10px]" title="Has a note">
              ●
            </span>
          )}
        </p>
      </div>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(frame.id)}
        className={`block w-full overflow-hidden rounded-sm border text-left ${
          selected ? "border-accent" : "border-border"
        }`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="block"
    >
      {content}
    </Link>
  );
}

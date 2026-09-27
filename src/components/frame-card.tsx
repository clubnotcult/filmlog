"use client";

import { useState } from "react";
import Link from "next/link";
import { formatExposureSummary } from "@/lib/exposure-format";
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
            src={frame.drive_thumbnail_url!}
            alt={`Frame ${frame.frame_number}`}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="font-mono text-xs text-muted">No photo yet</span>
        )}
        {frame.is_favorite && (
          <span
            className="absolute right-1.5 top-1.5 text-sm text-accent drop-shadow"
            aria-label="Favorite"
          >
            ★
          </span>
        )}
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
      <div className="px-2.5 py-2">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-xs text-muted-strong">
            #{frame.frame_number}
          </span>
          {frame.notes && (
            <span className="text-[10px] text-muted" title="Has a note">
              ●
            </span>
          )}
        </div>
        {summary ? (
          <p className="mt-0.5 truncate font-mono text-xs text-foreground">
            {summary}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted">No Exposure Data Recorded</p>
        )}
      </div>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(frame.id)}
        className={`block w-full overflow-hidden rounded-md border text-left ${
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
      className="block overflow-hidden rounded-md border border-border hover:border-accent"
    >
      {content}
    </Link>
  );
}

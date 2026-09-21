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
 */
export function FrameCard({
  frame,
  lensLabel,
  href,
}: {
  frame: Frame;
  lensLabel: string | null;
  href: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const summary = frame.metadata_logged
    ? formatExposureSummary(frame, lensLabel)
    : null;

  const showImage = Boolean(frame.drive_thumbnail_url) && !imageFailed;

  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-md border border-border hover:border-accent"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-surface">
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
    </Link>
  );
}

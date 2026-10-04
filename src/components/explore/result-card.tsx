"use client";

import { useState } from "react";
import Link from "next/link";
import { formatExposureSummary } from "@/lib/exposure-format";
import { SelectionMark } from "@/components/frame-organization/selection-mark";
import { driveThumbnailAtSize, GRID_THUMBNAIL_SIZE } from "@/lib/google-drive";
import type { Frame } from "@/lib/database.types";

/**
 * One photograph in the Explore grid. Fixed aspect-square sizing (never
 * derived from the image's own dimensions) so a page of results never
 * reflows as thumbnails load in — a broken or slow-loading thumbnail falls
 * back to a placeholder in the same footprint rather than collapsing.
 */
export function ExploreResultCard({
  frame,
  href,
  filmStockName,
  cameraName,
  lensName,
}: {
  frame: Frame;
  href: string;
  filmStockName: string | null;
  cameraName: string | null;
  lensName: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const showImage = Boolean(frame.drive_thumbnail_url) && !imageFailed;
  const summary = frame.metadata_logged ? formatExposureSummary(frame, lensName) : null;

  return (
    <Link
      href={href}
      className="block"
    >
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
          <span className="font-mono text-xs text-muted">Photo unavailable</span>
        )}
        <SelectionMark selection={frame.selection} />
      </div>
      {/* Same hierarchy everywhere: Drive filename first, then film + camera,
          then frame number and exposure as supporting detail. */}
      <div className="px-0.5 pb-2 pt-1.5">
        <p
          className="truncate font-mono text-xs text-foreground"
          title={frame.drive_filename ?? undefined}
        >
          {frame.drive_filename ?? `Frame ${frame.frame_number}`}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-strong">
          {[filmStockName, cameraName].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
          #{frame.frame_number}
          {summary ? ` · ${summary}` : ""}
        </p>
      </div>
    </Link>
  );
}

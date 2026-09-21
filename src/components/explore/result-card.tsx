"use client";

import { useState } from "react";
import Link from "next/link";
import { formatExposureSummary } from "@/lib/exposure-format";
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
  const showImage = Boolean(frame.drive_thumbnail_url) && !imageFailed;
  const summary = frame.metadata_logged ? formatExposureSummary(frame, lensName) : null;

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
          <span className="font-mono text-xs text-muted">Photo unavailable</span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs text-muted-strong">{filmStockName ?? "—"}</p>
        <p className="truncate text-xs text-muted">
          {cameraName ?? "—"}
          {lensName ? ` · ${lensName}` : ""}
        </p>
        {summary ? (
          <p className="mt-0.5 truncate font-mono text-[11px] text-foreground">{summary}</p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted">No exposure data</p>
        )}
      </div>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { formatExposureSummary } from "@/lib/exposure-format";
import { SelectionMark } from "@/components/frame-organization/selection-mark";
import { GRID_THUMBNAIL_SIZE } from "@/lib/google-drive";
import { useResilientImage } from "@/components/use-resilient-image";
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
  const { src, status, attach, onLoad, onError } = useResilientImage({
    url: frame.drive_thumbnail_url,
    size: GRID_THUMBNAIL_SIZE,
    frameId: frame.id,
    rollId: frame.roll_id,
  });
  const summary = frame.metadata_logged ? formatExposureSummary(frame, lensName) : null;

  return (
    <Link
      href={href}
      className="block"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable Drive URL
          <img
            ref={attach}
            src={src}
            alt={`Frame ${frame.frame_number}`}
            className="h-full w-full object-cover"
            loading="lazy"
            onLoad={onLoad}
            onError={onError}
          />
        )}
        {status === "none" && <span className="font-mono text-xs text-muted">No photo yet</span>}
        {status === "failed" && <span className="font-mono text-xs text-muted">Needs refresh</span>}
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

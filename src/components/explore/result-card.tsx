"use client";

import Link from "next/link";
import { SelectionMark } from "@/components/frame-organization/selection-mark";
import { GRID_THUMBNAIL_SIZE } from "@/lib/google-drive";
import { useResilientImage } from "@/components/use-resilient-image";
import { FilmStockDot } from "@/components/film-card";
import type { FilmCardDesign } from "@/lib/film-card";
import type { Frame } from "@/lib/database.types";

/**
 * One photograph in the Explore grid. Fixed aspect-square sizing (never
 * derived from the image's own dimensions) so a page of results never
 * reflows as thumbnails load in — a broken or slow-loading thumbnail falls
 * back to a placeholder in the same footprint rather than collapsing.
 *
 * Beneath the image, always in this order:
 *   1. Drive filename — the image's identity (opens the image)
 *   2. Roll name — links to the roll
 *   3. Film stock dot · shot number · camera abbreviation
 * Anything unknown is left out, never stood in for by a placeholder.
 */
export function ExploreResultCard({
  frame,
  href,
  roll,
  filmStock,
  cameraAbbreviation,
}: {
  frame: Frame;
  href: string;
  /** Null only if the roll couldn't be loaded; line 2 is then omitted. */
  roll: { id: string; title: string } | null;
  filmStock: { name: string; design: FilmCardDesign | null } | null;
  /** The camera's own abbreviation; null when none is set (nothing is derived). */
  cameraAbbreviation: string | null;
}) {
  const { src, status, attach, onLoad, onError } = useResilientImage({
    url: frame.drive_thumbnail_url,
    size: GRID_THUMBNAIL_SIZE,
    frameId: frame.id,
    rollId: frame.roll_id,
  });
  return (
    <div>
      <Link href={href} className="group block">
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
        <p
          className="truncate px-0.5 pt-1.5 font-mono text-xs text-foreground group-hover:underline group-hover:underline-offset-4"
          title={frame.drive_filename ?? undefined}
        >
          {frame.drive_filename ?? `Frame ${frame.frame_number}`}
        </p>
      </Link>
      <div className="px-0.5 pb-2">
        {roll && (
          <Link
            href={`/rolls/${roll.id}`}
            className="mt-0.5 block truncate text-xs text-muted-strong underline-offset-4 hover:text-foreground hover:underline"
            title={roll.title}
          >
            {roll.title}
          </Link>
        )}
        <p className="mt-1 flex h-3 items-center gap-1.5 font-mono text-[11px] leading-none text-muted">
          {filmStock && <FilmStockDot design={filmStock.design} name={filmStock.name} size={11} />}
          <span className="numeral">#{frame.frame_number}</span>
          {cameraAbbreviation && (
            <>
              <span aria-hidden className="text-border">
                ·
              </span>
              <span className="numeral truncate">{cameraAbbreviation}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

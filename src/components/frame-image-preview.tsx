"use client";

import { REVIEW_IMAGE_SIZE } from "@/lib/google-drive";
import { RefreshImagesButton } from "@/components/roll-lifecycle/refresh-images-button";
import { useResilientImage } from "@/components/use-resilient-image";

/**
 * The frame review image — the one place a person judges focus, exposure and
 * composition, so it asks for a much larger rendition than the grids do.
 *
 * Every state is named and none is permanent without a way out:
 *  - no URL            "No photo synced yet"
 *  - loading           the tile sits quietly empty (no text — it resolves)
 *  - ready             the picture
 *  - failed            "Image needs refreshing" plus a button that fixes it
 * A load that never answers is cut off by the shared timeout rather than
 * left loading forever, and a refresh that delivers a new URL starts the
 * image over without leaving the page.
 */
export function FrameImagePreview({
  thumbnailUrl,
  frameNumber,
  frameId,
  rollId,
  driveFolderId,
  rollFrames,
}: {
  thumbnailUrl: string | null;
  frameNumber: number;
  frameId: string;
  rollId: string;
  driveFolderId: string | null;
  /** Every frame of this roll (id + file id): refreshing one frame's link repairs its neighbours in the same Drive call. */
  rollFrames: { id: string; drive_file_id: string | null }[];
}) {
  const { src, status, attach, onLoad, onError } = useResilientImage({
    url: thumbnailUrl,
    size: REVIEW_IMAGE_SIZE,
    frameId,
    rollId,
    eager: true,
  });

  return (
    <div className="-mx-5 flex aspect-square items-center justify-center overflow-hidden bg-surface sm:mx-0">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable Drive URL
        <img
          ref={attach}
          src={src}
          alt={`Frame ${frameNumber}`}
          className="h-full w-full object-contain"
          onLoad={onLoad}
          onError={onError}
        />
      )}
      {status === "none" && <span className="label">No photo synced yet</span>}
      {status === "failed" && (
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <span className="label">Image needs refreshing</span>
          {driveFolderId && (
            <RefreshImagesButton
              rollId={rollId}
              driveFolderId={driveFolderId}
              frames={rollFrames}
              variant="link"
            />
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { driveThumbnailAtSize, REVIEW_IMAGE_SIZE } from "@/lib/google-drive";

/**
 * The frame review hero image — requests a substantially larger rendition
 * than the grid does (see driveThumbnailAtSize), since this is the one
 * place a person is actually judging focus, exposure, and composition, not
 * just recognizing a photo in a list.
 *
 * Two-step fallback, since the size rewrite can't be tested against a live
 * Drive URL from this environment: try the enlarged URL first; if it fails
 * to load, retry with the original unmodified thumbnailUrl (still valid,
 * just smaller) before giving up to the placeholder. A person should never
 * see a broken image here because an untested URL rewrite didn't match a
 * shape Drive returns in practice.
 */
export function FrameImagePreview({
  thumbnailUrl,
  frameNumber,
}: {
  thumbnailUrl: string | null;
  frameNumber: number;
}) {
  const [triedFallback, setTriedFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  const enlargedUrl = thumbnailUrl ? driveThumbnailAtSize(thumbnailUrl, REVIEW_IMAGE_SIZE) : null;
  const src = triedFallback ? thumbnailUrl : enlargedUrl;
  const showImage = Boolean(src) && !failed;

  return (
    <div className="-mx-5 flex aspect-square items-center justify-center overflow-hidden bg-surface sm:mx-0">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable Drive URL
        <img
          src={src!}
          alt={`Frame ${frameNumber}`}
          className="h-full w-full object-contain"
          onError={() => {
            if (!triedFallback) setTriedFallback(true);
            else setFailed(true);
          }}
        />
      ) : (
        <span className="label">No photo synced yet</span>
      )}
    </div>
  );
}

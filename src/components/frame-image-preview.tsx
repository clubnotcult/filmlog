"use client";

import { useState } from "react";

export function FrameImagePreview({
  thumbnailUrl,
  frameNumber,
}: {
  thumbnailUrl: string | null;
  frameNumber: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(thumbnailUrl) && !failed;

  return (
    <div className="-mx-5 flex aspect-square items-center justify-center overflow-hidden bg-surface sm:mx-0">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable Drive URL
        <img
          src={thumbnailUrl!}
          alt={`Frame ${frameNumber}`}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="label">No photo synced yet</span>
      )}
    </div>
  );
}

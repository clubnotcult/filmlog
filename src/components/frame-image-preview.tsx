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
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable Drive URL
        <img
          src={thumbnailUrl!}
          alt={`Frame ${frameNumber}`}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-mono text-sm text-muted">No photo synced yet</span>
      )}
    </div>
  );
}

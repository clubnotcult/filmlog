"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { driveThumbnailAtSize } from "@/lib/google-drive/files";
import { reportImageFailed, reportImageOk, useImageEpoch } from "@/lib/google-drive/image-health";
import {
  IMAGE_LOAD_TIMEOUT_MS,
  imageKey,
  initialImageState,
  reduceImage,
  stateFor,
  type ImageEvent,
  type ImageState,
  type ImageStatus,
} from "@/lib/image-state";

/**
 * Drives one Drive thumbnail through the state machine in lib/image-state.
 * Shared by the roll grid, Explore, and the frame review image, which used to
 * carry three slightly different copies of this logic.
 *
 * What it adds on top of the pure reducer:
 *  - State is re-derived from (url, refresh epoch), so a refresh that delivers
 *    a new URL — or finishes at all — makes a previously failed image try
 *    again without anything remounting.
 *  - The timeout only runs once the image is near the viewport. Browsers
 *    defer `loading="lazy"` images until you scroll toward them, so an
 *    off-screen image legitimately produces neither a load nor an error;
 *    timing it out would label every below-the-fold image "failed".
 *  - A <img> that finished before React attached to it (cached, or loaded
 *    during server render) never fires onLoad again, so the ref callback
 *    checks `complete` directly.
 *  - Failures are reported to the shared image-health store, which is how the
 *    page learns which rolls to repair.
 */
export function useResilientImage({
  url,
  size,
  frameId,
  rollId,
  eager = false,
}: {
  url: string | null;
  size: number;
  frameId?: string;
  rollId?: string;
  /** True for images that load immediately (no lazy loading), e.g. the review image. */
  eager?: boolean;
}) {
  const epoch = useImageEpoch();
  const key = imageKey(url, epoch);

  const [stored, dispatch] = useReducer(
    (prev: ImageState, event: ImageEvent) => reduceImage(stateFor(prev, event.key), event),
    key,
    initialImageState,
  );
  const state = stateFor(stored, key);

  const supportsObserver = typeof IntersectionObserver !== "undefined";
  const [near, setNear] = useState(eager || !supportsObserver);

  // Bound every attempt: a request that never answers still ends.
  useEffect(() => {
    if (state.status !== "loading" || !near) return;
    const timer = setTimeout(() => dispatch({ type: "timeout", key }), IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.status, state.stage, near, key]);

  // Tell the page which frames' images can't be shown.
  useEffect(() => {
    if (!frameId) return;
    if (state.status === "failed" && rollId) reportImageFailed(frameId, rollId);
    else reportImageOk(frameId);
  }, [state.status, frameId, rollId]);
  useEffect(
    () => () => {
      if (frameId) reportImageOk(frameId);
    },
    [frameId],
  );

  // A callback ref that returns its own cleanup (React 19), so the observer
  // is torn down whenever the <img> or its URL changes — no refs held here.
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;

      if (img.complete) {
        queueMicrotask(() => dispatch({ type: img.naturalWidth > 0 ? "loaded" : "error", key }));
      }
      if (near || typeof IntersectionObserver === "undefined") return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setNear(true);
            observer.disconnect();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(img);
      return () => observer.disconnect();
    },
    // `key` and `near` cover it; the stage changes src, so it is intentionally listed too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, near, state.stage],
  );

  const src = url ? (state.stage === "enlarged" ? driveThumbnailAtSize(url, size) : url) : null;

  return {
    src: state.status === "failed" ? null : src,
    status: state.status as ImageStatus,
    attach,
    onLoad: () => dispatch({ type: "loaded", key }),
    onError: () => dispatch({ type: "error", key }),
  };
}

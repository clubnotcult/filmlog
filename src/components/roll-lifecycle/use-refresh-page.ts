"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markImagesRefreshed } from "@/lib/google-drive/image-health";

/**
 * Re-renders the current page's server data and says when that is actually
 * finished. `router.refresh()` inside a transition stays "pending" until the
 * new server render has arrived, so `isUpdating` is a real signal ("Updating
 * library…"), not a guess.
 *
 * When it finishes, thumbnails are told to retry (markImagesRefreshed). That
 * covers the case a changed URL alone doesn't: a refresh that returns the SAME
 * URL string for an image that failed for some other reason (a dropped
 * connection) would otherwise never be retried.
 */
export function useRefreshPage() {
  const router = useRouter();
  const [isUpdating, startTransition] = useTransition();
  const wasUpdating = useRef(false);

  useEffect(() => {
    if (wasUpdating.current && !isUpdating) markImagesRefreshed();
    wasUpdating.current = isUpdating;
  }, [isUpdating]);

  const refreshPage = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  return { isUpdating, refreshPage };
}

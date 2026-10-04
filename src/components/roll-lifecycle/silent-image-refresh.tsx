"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getDriveAccessTokenSilently } from "@/lib/google-drive/auth";
import { refreshRollImages } from "@/lib/google-drive/refresh-service";

/**
 * Renders nothing. On mount, best-effort and entirely silent: if (and only
 * if) a Drive access token can be obtained without showing any UI (an
 * existing browser session that already granted this app access), refresh
 * this roll's images via the shared refreshRollImages service — the same
 * logic the manual "Refresh Images" button and Library's "Sync All" use.
 *
 * This exists because thumbnailLink is documented by Google as short-lived
 * ("typically lasts on the order of hours") while the drive_file_id
 * identifying the photo is permanent — so periodically re-deriving a fresh
 * URL from that stable id is what keeps images visible without the person
 * ever needing to think about re-syncing. If a silent token can't be
 * obtained (no prior consent, expired browser session, offline, anything),
 * this simply does nothing and the page's existing broken-image fallback
 * still applies — never worse than before, sometimes invisibly better.
 *
 * One network round trip to Drive per roll per page view at most, and only
 * when there's something to check — never on an unsynced roll, and never
 * more than once per mount.
 */
export function SilentImageRefresh({
  rollId,
  driveFolderId,
  frames,
}: {
  rollId: string;
  driveFolderId: string | null;
  frames: { id: string; drive_file_id: string | null }[];
}) {
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!driveFolderId) return;
    if (!frames.some((f) => f.drive_file_id !== null)) return;

    (async () => {
      const token = await getDriveAccessTokenSilently();
      if (!token) return;

      const result = await refreshRollImages(token, rollId, driveFolderId, frames);
      if (result.ok && result.updatedCount > 0) {
        router.refresh();
      }
    })();
  }, [rollId, driveFolderId, frames, router]);

  return null;
}

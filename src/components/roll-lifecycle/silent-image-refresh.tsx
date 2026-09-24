"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getDriveAccessTokenSilently } from "@/lib/google-drive/auth";
import { listFolderJpegs } from "@/lib/google-drive/files";
import { refreshFrameImageLinks } from "@/app/(app)/rolls/[id]/sync/actions";

/**
 * Renders nothing. On mount, best-effort and entirely silent: if (and only
 * if) a Drive access token can be obtained without showing any UI (an
 * existing browser session that already granted this app access), re-fetch
 * this roll's folder contents once and refresh any of these frames' cached
 * thumbnail/view URLs that have drifted from what Drive now reports.
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
    const syncedFrames = frames.filter(
      (f): f is { id: string; drive_file_id: string } => f.drive_file_id !== null,
    );
    if (syncedFrames.length === 0) return;

    (async () => {
      const token = await getDriveAccessTokenSilently();
      if (!token) return;

      const files = await listFolderJpegs(token, driveFolderId).catch(() => null);
      if (!files) return;

      const fileById = new Map(files.map((f) => [f.id, f]));
      const updates = syncedFrames
        .map((frame) => {
          const file = fileById.get(frame.drive_file_id);
          if (!file) return null;
          return {
            frameId: frame.id,
            thumbnailUrl: file.thumbnailLink,
            viewUrl: file.webViewLink,
          };
        })
        .filter((u): u is NonNullable<typeof u> => u !== null);

      if (updates.length === 0) return;

      const result = await refreshFrameImageLinks(rollId, updates);
      if (result.ok && result.data > 0) {
        router.refresh();
      }
    })();
  }, [rollId, driveFolderId, frames, router]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { getDriveAccessTokenSilently } from "@/lib/google-drive/auth";
import { setAuthNeeded, useImageHealth } from "@/lib/google-drive/image-health";
import { refreshManyRolls } from "@/lib/google-drive/refresh-service";
import { useRefreshPage } from "./use-refresh-page";

export type AutoRepairRoll = {
  rollId: string;
  driveFolderId: string | null;
  frames: { id: string; drive_file_id: string | null }[];
};

/**
 * Repairs expired thumbnails without being asked — but only the rolls that
 * actually have an image on screen that failed to load, and only once each
 * per visit. (The previous version re-fetched every visible roll's folder on
 * every page view whether or not anything was broken, and silently did
 * nothing when it couldn't get a token.)
 *
 * It never opens a Google window: it uses a cached token, or Google's
 * `prompt: "none"` mode. If neither is available it does not retry or hang —
 * it records that the person needs to reconnect, which the refresh control
 * surfaces as an explicit "Reconnect Google" button. A tap is what lets the
 * browser open that window, so only a tap can fix it.
 */
export function useAutoImageRepair(rolls: AutoRepairRoll[]) {
  const { failedRollIds } = useImageHealth();
  const { refreshPage } = useRefreshPage();
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const targets = rolls.filter(
      (r) =>
        r.driveFolderId !== null &&
        failedRollIds.includes(r.rollId) &&
        !attempted.current.has(r.rollId) &&
        r.frames.some((f) => f.drive_file_id !== null),
    );
    if (targets.length === 0) return;

    // Let a screenful of images finish failing before acting, so one repair
    // covers them all instead of one per image.
    const timer = setTimeout(async () => {
      targets.forEach((t) => attempted.current.add(t.rollId));

      const token = await getDriveAccessTokenSilently();
      if (!token) {
        setAuthNeeded(true);
        return;
      }

      const results = await refreshManyRolls(
        token,
        targets.map((t) => ({ rollId: t.rollId, driveFolderId: t.driveFolderId!, frames: t.frames })),
        { concurrency: 4 },
      );
      setAuthNeeded(results.some((r) => !r.ok && r.reason === "auth"));
      if (results.some((r) => r.ok && r.updatedCount > 0)) refreshPage();
    }, 700);

    return () => clearTimeout(timer);
  }, [failedRollIds, rolls, refreshPage]);
}

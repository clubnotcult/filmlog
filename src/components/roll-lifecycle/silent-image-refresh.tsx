"use client";

import { useMemo } from "react";
import { useAutoImageRepair } from "./use-auto-image-repair";

/**
 * Renders nothing. Keeps one roll's thumbnails working in the background:
 * if any of this roll's images fail to load, it re-derives fresh links for
 * the roll (thumbnailLink is documented by Google as short-lived — "typically
 * hours" — while the drive_file_id is permanent).
 *
 * This is the same failure-driven repair the All Images page uses, scoped to
 * one roll. It only acts when something actually failed, never opens a Google
 * window, and when it can't get access without one, it leaves a visible
 * "Needs refresh" on the image with a button to fix it — rather than the old
 * behaviour of quietly doing nothing.
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
  const rolls = useMemo(() => [{ rollId, driveFolderId, frames }], [rollId, driveFolderId, frames]);
  useAutoImageRepair(rolls);
  return null;
}

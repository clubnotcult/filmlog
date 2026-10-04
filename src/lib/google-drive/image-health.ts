"use client";

import { useSyncExternalStore } from "react";

/**
 * A small shared record of which images on screen couldn't load, and whether
 * repairing them needs the person to reconnect Google. Thumbnail cards report
 * into it; the refresh controls read from it. A module-level store (rather
 * than React context) because the reporters (cards) and readers (controls)
 * live in different branches of different pages, and neither should have to
 * be threaded through the other's props.
 *
 * It's what turns "an image silently showed a dead placeholder" into "this
 * page knows 6 images from 2 rolls need refreshing" — the information the
 * old code never gathered anywhere.
 */

type Snapshot = {
  failedCount: number;
  failedRollIds: readonly string[];
  /** The last automatic attempt could not get a Google token without the person. */
  authNeeded: boolean;
  /** Bumped when a refresh finishes, so images that failed retry even if their URL string didn't change. */
  epoch: number;
};

const failed = new Map<string, string>(); // frameId -> rollId
let authNeeded = false;
let epoch = 0;
const listeners = new Set<() => void>();

function compute(): Snapshot {
  return {
    failedCount: failed.size,
    failedRollIds: [...new Set(failed.values())],
    authNeeded,
    epoch,
  };
}

let snapshot: Snapshot = compute();
const SERVER_SNAPSHOT: Snapshot = { failedCount: 0, failedRollIds: [], authNeeded: false, epoch: 0 };

function emit() {
  snapshot = compute();
  listeners.forEach((l) => l());
}

export function reportImageFailed(frameId: string, rollId: string) {
  if (failed.get(frameId) === rollId) return;
  failed.set(frameId, rollId);
  emit();
}

export function reportImageOk(frameId: string) {
  if (failed.delete(frameId)) emit();
}

export function setAuthNeeded(value: boolean) {
  if (authNeeded === value) return;
  authNeeded = value;
  emit();
}

export function markImagesRefreshed() {
  epoch++;
  emit();
}

export function useImageHealth(): Snapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
}

/** Just the refresh epoch, so thumbnails re-render when a refresh finishes — not on every unrelated failure report. */
export function useImageEpoch(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot.epoch,
    () => 0,
  );
}

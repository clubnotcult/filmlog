"use client";

/**
 * Persists the in-progress (not yet saved) frame's UI state to localStorage,
 * keyed to the exact roll + frame number it belongs to. This exists purely so
 * a browser refresh doesn't destroy a selection the user just made — it is
 * NEVER read as authorization to create a frame. The server always computes
 * the actual next frame number itself (see save_frame_and_advance); this
 * cache only pre-fills form inputs.
 *
 * If the cached draft's frame number no longer matches the roll's actual next
 * frame (e.g. a frame was saved from another tab/device since), the draft is
 * stale and must be discarded rather than reused.
 */

export type FrameDraft = {
  frameNumber: number;
  shutterSpeed: string | null;
  shutterTouched: boolean;
  aperture: number | null;
  apertureTouched: boolean;
  lensId: string;
  lensTouched: boolean;
  pushPull: number;
  pushTouched: boolean;
  meterType: string | null;
  meterTouched: boolean;
  notes: string;
};

function draftKey(rollId: string): string {
  return `filmlog:draft:${rollId}`;
}

export function loadFrameDraft(
  rollId: string,
  expectedFrameNumber: number,
): FrameDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(rollId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FrameDraft;
    if (parsed.frameNumber !== expectedFrameNumber) {
      // Stale — some other save has already moved the roll past this draft.
      window.localStorage.removeItem(draftKey(rollId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveFrameDraft(rollId: string, draft: FrameDraft): void {
  try {
    window.localStorage.setItem(draftKey(rollId), JSON.stringify(draft));
  } catch {
    // Best-effort only (e.g. private browsing may block storage) — the
    // shooting workflow itself never depends on this succeeding.
  }
}

export function clearFrameDraft(rollId: string): void {
  try {
    window.localStorage.removeItem(draftKey(rollId));
  } catch {
    // Ignore.
  }
}

/**
 * The state machine for one thumbnail, as a pure reducer so it can be tested
 * without a browser. Every image is always in exactly one state, and every
 * path through it ends:
 *
 *   none     no URL at all (never synced) — final, and says so
 *   loading  waiting on the network — left only by load, error, or timeout
 *   ready    pixels arrived
 *   failed   both URLs errored, or nothing happened for too long — final until
 *            the URL changes or a refresh bumps the epoch
 *
 * It tries the enlarged rendition first and the original URL second, so a
 * size rewrite Drive doesn't honour degrades to a smaller picture rather than
 * a dead one.
 *
 * The state is keyed by the URL (and refresh epoch) it describes. When either
 * changes — which is exactly what a successful refresh does — the image
 * starts over. The previous version kept a plain `failed` flag in component
 * state, so a card that had failed once stayed failed after the refresh
 * delivered a working URL, until the component was remounted: the "leave the
 * page and come back" behaviour.
 */

export type ImageStatus = "none" | "loading" | "ready" | "failed";
export type ImageStage = "enlarged" | "original";

export type ImageState = {
  key: string | null;
  stage: ImageStage;
  status: ImageStatus;
};

export type ImageEvent = { type: "loaded" | "error" | "timeout"; key: string | null };

/** How long ONE attempt may sit in "loading" before moving on (enlarged -> original -> failed), so the worst case is bounded at twice this. */
export const IMAGE_LOAD_TIMEOUT_MS = 15_000;

export function imageKey(url: string | null, epoch: number): string | null {
  return url ? `${epoch}|${url}` : null;
}

export function initialImageState(key: string | null): ImageState {
  return { key, stage: "enlarged", status: key ? "loading" : "none" };
}

export function reduceImage(state: ImageState, event: ImageEvent): ImageState {
  // An event about a different URL/epoch than the one currently shown is stale
  // (e.g. the old image erroring after the new URL was already set) — ignore.
  if (event.key !== state.key) return state;
  if (state.status === "none") return state;

  // Once pixels have arrived, a late error/timeout event doesn't un-show them.
  if (state.status === "ready" && event.type !== "loaded") return state;
  if (state.status === "failed") return state;

  switch (event.type) {
    case "loaded":
      return state.status === "ready" ? state : { ...state, status: "ready" };
    case "error":
    case "timeout":
      // Both mean "this attempt isn't going to produce an image": try the
      // plain URL next, and only after that give up.
      return state.stage === "enlarged"
        ? { ...state, stage: "original", status: "loading" }
        : { ...state, status: "failed" };
  }
}

/** The state to use for `key`: the stored one if it describes this key, otherwise a fresh start. */
export function stateFor(stored: ImageState, key: string | null): ImageState {
  return stored.key === key ? stored : initialImageState(key);
}

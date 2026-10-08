/**
 * Typed failures for the Drive layer, so the UI can tell the difference
 * between "Google needs the person to sign in again" (actionable, one tap),
 * "that Drive folder is gone" (needs attention on one roll), and "Drive is
 * having a moment" (try again) — instead of one opaque error string that all
 * looked like the same stuck "Processing".
 */

export type DriveAuthFailure =
  | "popup_blocked" // browser refused to open Google's window (no user gesture)
  | "popup_closed" // person closed it before finishing
  | "denied" // person declined access
  | "needs_interaction" // a no-UI attempt couldn't succeed without one
  | "timeout" // nothing came back in a reasonable time
  | "unavailable" // Google's script couldn't load / unknown failure
  | "not_configured";

export class DriveAuthError extends Error {
  constructor(
    public readonly code: DriveAuthFailure,
    message: string,
  ) {
    super(message);
    this.name = "DriveAuthError";
  }
}

/** status 0 means the request never got an HTTP response (offline, timeout, aborted). */
export class DriveApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: string = "",
  ) {
    super(message);
    this.name = "DriveApiError";
  }
}

export type RefreshFailureReason = "auth" | "missing_folder" | "transient" | "failed";

export function classifyRefreshError(err: unknown): { reason: RefreshFailureReason; message: string } {
  if (err instanceof DriveAuthError) return { reason: "auth", message: err.message };
  if (err instanceof DriveApiError) {
    if (err.status === 401) return { reason: "auth", message: "Google access expired." };
    if (err.status === 403) {
      // 403 is overloaded: Drive uses it both for "you're going too fast" and
      // for "this token isn't allowed to do that". Only the first is transient.
      return /ratelimit/i.test(err.body)
        ? { reason: "transient", message: "Google Drive is rate limiting requests." }
        : { reason: "auth", message: "Google access was refused — reconnect to continue." };
    }
    if (err.status === 404) return { reason: "missing_folder", message: "That Drive folder wasn't found." };
    if (err.status === 0 || err.status === 429 || err.status >= 500) {
      return { reason: "transient", message: "Google Drive is temporarily unavailable." };
    }
    return { reason: "failed", message: err.message };
  }
  // fetch() itself rejects with a TypeError when offline.
  if (err instanceof TypeError) return { reason: "transient", message: "Couldn't reach Google Drive." };
  return { reason: "failed", message: err instanceof Error ? err.message : "Couldn't refresh images." };
}

/** Transient failures are worth a quick retry; everything else won't change by retrying. */
export function isTransientFailure(err: unknown): boolean {
  return classifyRefreshError(err).reason === "transient";
}

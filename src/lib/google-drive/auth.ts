"use client";

import { isGoogleIdentityLoaded, loadGoogleIdentityServices } from "./scripts";
import { GOOGLE_DRIVE_SCOPE, getGoogleDriveEnv } from "./config";
import { DriveAuthError, type DriveAuthFailure } from "./errors";

/**
 * Google Drive access tokens, in memory only (no refresh token, nothing
 * persisted — by design, see config.ts). This module is the single place that
 * talks to Google Identity Services, and it exists to guarantee three things
 * the previous version did not:
 *
 *  1. EVERY request settles. GIS reports "popup blocked" and "popup closed"
 *     through `error_callback`, not `callback`; the old code registered only
 *     `callback`, so those cases left the returned promise pending forever and
 *     the UI sat on "Preparing…". Both modes also have a timeout as a last
 *     resort (a script that never answers).
 *  2. The tap's user activation is preserved. Browsers (iOS Safari most
 *     strictly) only let a click open Google's sign-in window if it is opened
 *     in that same click. So when Google's script is already loaded, the
 *     request is made synchronously — callers must therefore ask for the
 *     token BEFORE awaiting anything else in a click handler.
 *  3. Expiry is real. The token's actual `expires_in` is honoured, and a token
 *     Google rejected can be dropped (clearDriveToken) instead of being reused
 *     for a hard-coded 50 minutes.
 */

let cachedToken: { token: string; expiresAt: number } | null = null;
let interactiveInflight: Promise<string> | null = null;
let silentInflight: Promise<string | null> | null = null;

const EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_LIFETIME_S = 3000; // used only if Google omits expires_in
const INTERACTIVE_TIMEOUT_MS = 120_000; // a person may take a while to pick an account
const SILENT_TIMEOUT_MS = 8_000;

/** A token that is still good, or null. Never opens anything. */
export function getCachedDriveToken(): string | null {
  if (cachedToken && cachedToken.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cachedToken.token;
  return null;
}

/** Drop the cached token — call when Google rejects it, so the next attempt re-authorizes instead of reusing a dead one. */
export function clearDriveToken(): void {
  cachedToken = null;
}

/** Start loading Google's script ahead of any tap, so the later tap can open the sign-in window immediately. */
export function preloadDriveAuth(): void {
  void loadGoogleIdentityServices().catch(() => {
    /* a failed preload is retried (and reported) when something actually needs it */
  });
}

const MESSAGES: Record<DriveAuthFailure, string> = {
  popup_blocked: "Your browser blocked Google's sign-in window. Tap again to continue.",
  popup_closed: "Google sign-in was closed before it finished.",
  denied: "Google Drive access was declined.",
  needs_interaction: "Google needs you to sign in again.",
  timeout: "Google sign-in didn't complete. Try again.",
  unavailable: "Couldn't reach Google sign-in.",
  not_configured: "Google Drive isn't set up for this app.",
};

function authError(code: DriveAuthFailure): DriveAuthError {
  return new DriveAuthError(code, MESSAGES[code]);
}

function mapOAuthError(error: string | undefined, mode: "interactive" | "silent"): DriveAuthFailure {
  if (mode === "silent") return "needs_interaction";
  if (error === "access_denied") return "denied";
  return "unavailable";
}

function startTokenRequest(mode: "interactive" | "silent"): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(authError(mode === "interactive" ? "timeout" : "needs_interaction"))),
      mode === "interactive" ? INTERACTIVE_TIMEOUT_MS : SILENT_TIMEOUT_MS,
    );

    let clientId: string;
    try {
      clientId = getGoogleDriveEnv().clientId;
    } catch {
      finish(() => reject(authError("not_configured")));
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      // The documented value for "never show a sign-in or consent screen".
      // (The previous version passed "" and described it as silent — it is
      // not: "" is the default, which DOES open a window when sign-in or
      // consent is needed, and without a tap the browser blocks that window.)
      ...(mode === "silent" ? { prompt: "none" } : {}),
      callback: (response) => {
        if (response.error || !response.access_token) {
          finish(() => reject(authError(mapOAuthError(response.error, mode))));
          return;
        }
        const lifetimeS = Number(response.expires_in) || DEFAULT_LIFETIME_S;
        finish(() => {
          cachedToken = { token: response.access_token!, expiresAt: Date.now() + lifetimeS * 1000 };
          resolve(response.access_token!);
        });
      },
      error_callback: (err) => {
        const code: DriveAuthFailure =
          mode === "silent"
            ? "needs_interaction"
            : err.type === "popup_closed"
              ? "popup_closed"
              : err.type === "popup_failed_to_open"
                ? "popup_blocked"
                : "unavailable";
        finish(() => reject(authError(code)));
      },
    });
    client.requestAccessToken();
  });
}

/**
 * Runs `start` right now if Google's script is loaded (keeping the caller's
 * tap intact), otherwise after loading it. A load failure becomes a typed
 * auth error rather than an unhandled rejection.
 */
function whenReady<T>(start: () => Promise<T>): Promise<T> {
  if (isGoogleIdentityLoaded()) return start();
  return loadGoogleIdentityServices().then(start, () => Promise.reject(authError("unavailable")));
}

/**
 * For an explicit tap. Returns a cached token if there is one; otherwise opens
 * Google's sign-in (which may show consent). Rejects with a DriveAuthError
 * describing exactly what happened — never hangs. Concurrent calls share one
 * window rather than opening several.
 */
export function getDriveAccessToken(): Promise<string> {
  const cached = getCachedDriveToken();
  if (cached) return Promise.resolve(cached);
  if (!interactiveInflight) {
    interactiveInflight = whenReady(() => startTokenRequest("interactive")).finally(() => {
      interactiveInflight = null;
    });
  }
  return interactiveInflight;
}

/**
 * For automatic, no-gesture use. Cached token if available; otherwise a
 * `prompt: "none"` request that Google documents as displaying no screens.
 * Resolves to null (never rejects, never opens a window) when it can't be done
 * without the person — the caller should then offer an explicit "Reconnect".
 */
export function getDriveAccessTokenSilently(): Promise<string | null> {
  const cached = getCachedDriveToken();
  if (cached) return Promise.resolve(cached);
  if (!silentInflight) {
    silentInflight = whenReady(() => startTokenRequest("silent"))
      .catch(() => null)
      .finally(() => {
        silentInflight = null;
      });
  }
  return silentInflight;
}

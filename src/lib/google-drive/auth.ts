"use client";

import { loadGoogleIdentityServices } from "./scripts";
import { GOOGLE_DRIVE_SCOPE, getGoogleDriveEnv } from "./config";

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Requests a short-lived Drive access token via Google Identity Services'
 * token client. This opens Google's own consent popup the first time (or
 * whenever the cached token has expired); subsequent syncs within the same
 * browser session reuse the cached token silently.
 *
 * There is no refresh token and nothing is persisted server-side — by design
 * (see config.ts). If the user closes the consent popup without approving,
 * this rejects.
 */
export async function getDriveAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  await loadGoogleIdentityServices();
  const { clientId } = getGoogleDriveEnv();

  return new Promise<string>((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ??
                response.error ??
                "Google sign-in was cancelled or failed.",
            ),
          );
          return;
        }
        // Google tokens from this flow are typically valid ~1 hour; we don't
        // get an explicit expiry from the callback payload, so cache
        // conservatively for 50 minutes.
        cachedToken = { token: response.access_token, expiresAt: Date.now() + 50 * 60_000 };
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}

/**
 * Attempts to get a Drive access token WITHOUT ever showing Google's consent
 * UI — `prompt: ""` tells Google Identity Services to only succeed if it can
 * do so invisibly (an existing browser session that has already granted this
 * scope to this app). Resolves to null rather than rejecting on any failure.
 *
 * This exists specifically for background/automatic use (refreshing a stale
 * thumbnail link while someone is just browsing their archive) — those call
 * sites must never surprise the person with a popup. The explicit "Sync
 * Photos" / "Refresh Images" actions the person clicks on purpose still use
 * getDriveAccessToken above, where an interactive prompt is expected and
 * fine.
 */
export async function getDriveAccessTokenSilently(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  try {
    await loadGoogleIdentityServices();
    const { clientId } = getGoogleDriveEnv();

    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      // Never hang the page waiting on this — if Google hasn't responded
      // quickly, treat it as "can't refresh silently right now" and move on.
      const timeout = setTimeout(() => finish(null), 4000);

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: (response) => {
          clearTimeout(timeout);
          if (response.error || !response.access_token) {
            finish(null);
            return;
          }
          cachedToken = {
            token: response.access_token,
            expiresAt: Date.now() + 50 * 60_000,
          };
          finish(response.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt: "" });
    });
  } catch {
    return null;
  }
}

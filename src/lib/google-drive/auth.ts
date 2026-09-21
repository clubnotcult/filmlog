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

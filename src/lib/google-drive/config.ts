/**
 * Google Drive integration — environment configuration.
 *
 * Deliberately uses the client-side OAuth "token" flow (Google Identity
 * Services' token client + Google Picker), NOT a server-side authorization-
 * code flow. This is Google's own documented pattern for exactly this use
 * case (pick a file/folder, then read it) and has real advantages here:
 *
 *   - No client secret, no refresh token, nothing long-lived to store or
 *     protect in the database. The access token lives only in the browser
 *     for the duration of a sync, then Google's SDK discards it.
 *   - Scope is `drive.file`, the narrowest one that works with Picker: it
 *     only grants access to files/folders the user explicitly picks through
 *     the picker UI, not blanket read access to their whole Drive.
 *   - Syncing is an occasional, user-initiated action ("SYNC PHOTOS"), not a
 *     background service — there's no need for offline/unattended access,
 *     so the simpler token flow is not just adequate but the better fit.
 *
 * Needs three values, all public (used entirely client-side):
 *   NEXT_PUBLIC_GOOGLE_CLIENT_ID — OAuth 2.0 Client ID (Web application)
 *     from Google Cloud Console, with this app's origin(s) in "Authorized
 *     JavaScript origins".
 *   NEXT_PUBLIC_GOOGLE_API_KEY — an API key with the Google Picker API and
 *     Google Drive API enabled, restricted to this app's HTTP referrers.
 *   NEXT_PUBLIC_GOOGLE_APP_ID — your Cloud project NUMBER (not the project
 *     ID string). Required by PickerBuilder.setAppId — Google's Picker
 *     rejects folder access without it.
 */

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function hasGoogleDriveEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY &&
      process.env.NEXT_PUBLIC_GOOGLE_APP_ID,
  );
}

export function getGoogleDriveEnv(): { clientId: string; apiKey: string; appId: string } {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;

  if (!clientId || !apiKey || !appId) {
    throw new Error(
      "Missing Google Drive environment variables. Set " +
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_API_KEY, and " +
        "NEXT_PUBLIC_GOOGLE_APP_ID.",
    );
  }

  return { clientId, apiKey, appId };
}

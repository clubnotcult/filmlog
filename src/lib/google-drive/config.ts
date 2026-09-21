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
 *   - Syncing is an occasional, user-initiated action ("SYNC PHOTOS"), not a
 *     background service — there's no need for offline/unattended access.
 *
 * Scope: `drive.readonly`.
 *
 * Two earlier, narrower choices both turned out not to work for this app's
 * actual use case, and it's worth recording why rather than silently landing
 * here:
 *
 *   - `drive.file` is a *per-file* grant — picking a folder with it
 *     authorizes the app to read that folder as an object, but not to
 *     enumerate what's inside it. Listing a folder's children returns zero
 *     results under drive.file (a known, documented Drive API behavior).
 *   - `drive.metadata.readonly` fixes the listing problem (it grants
 *     read-only access to file metadata across the whole Drive) but
 *     Google's Drive API explicitly states thumbnailLink "is only populated
 *     when the requesting app can access the file's content" — and
 *     metadata.readonly, by design, strictly prohibits content access. Every
 *     thumbnail would come back blank.
 *
 * `drive.readonly` is the narrowest scope that actually satisfies both
 * requirements at once (browse a folder, get real thumbnails for files
 * inside it that were never individually picked) — it's still read-only, and
 * meaningfully narrower than the full `drive` scope (which is read-write),
 * but it does grant content-read access across the Drive, not just this
 * roll's folder. That's a genuine, unavoidable trade-off of this feature as
 * specified (bulk-processing a folder's contents without picking each file
 * individually), not a shortcut taken for convenience.
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

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

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

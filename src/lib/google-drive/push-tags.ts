"use client";

import { getDriveAccessTokenSilently } from "./auth";
import { updateFileDescription } from "./write";

/**
 * Pushes the FULL current tag list for a frame into its Drive file's
 * description, comma-separated (e.g. "julian, 35mm, atx") — this is what
 * Drive's own search actually finds, confirmed against a real account.
 * Overwrites the whole field rather than appending, so it always exactly
 * matches Film Log's tags for that frame; if Drive already had some other
 * description text on the file (unlikely for a scanned JPEG, but possible),
 * that text is replaced, not preserved.
 *
 * Silent-only and always best-effort: if a token can't be obtained without
 * showing Google's consent UI (no prior grant, expired session, offline),
 * this simply does nothing. Tagging itself never waits on or fails because
 * of this — the tag is already saved in Postgres regardless — so a missed
 * push here is a missed convenience, not lost data.
 */
export async function pushTagsToDrive(
  driveFileId: string | null,
  tags: string[],
): Promise<void> {
  if (!driveFileId) return;
  try {
    const token = await getDriveAccessTokenSilently();
    if (!token) return;
    await updateFileDescription(token, driveFileId, tags.join(", "));
  } catch {
    // Best-effort — never surface this as an error in the tagging UI.
  }
}

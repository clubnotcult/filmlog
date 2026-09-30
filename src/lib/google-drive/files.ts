import type { DriveJpegFile, SyncPreview } from "./types";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

/**
 * Lists every file directly inside the given folder (paginating as needed —
 * Drive returns at most ~1000 per page), then keeps only supported JPEGs.
 * Filtering happens client-side on BOTH mimeType and filename extension
 * (not just a `mimeType = 'image/jpeg'` query param) because some scanning
 * tools mislabel the MIME type; a file that's clearly a .jpg by name is kept
 * even if its reported mimeType is slightly off.
 */
export async function listFolderJpegs(
  accessToken: string,
  folderId: string,
): Promise<DriveJpegFile[]> {
  const files: DriveJpegFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, thumbnailLink, webViewLink, createdTime)",
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Drive API error (${res.status}): ${body || res.statusText}`);
    }

    const data = (await res.json()) as {
      nextPageToken?: string;
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        thumbnailLink?: string;
        webViewLink?: string;
        createdTime?: string;
      }>;
    };

    for (const f of data.files ?? []) {
      if (isSupportedJpeg(f.name, f.mimeType)) {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          thumbnailLink: f.thumbnailLink ?? null,
          webViewLink: f.webViewLink ?? null,
          createdTime: f.createdTime ?? null,
        });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

function isSupportedJpeg(filename: string, mimeType: string): boolean {
  const isJpegMime = mimeType === "image/jpeg" || mimeType === "image/jpg";
  const isJpegExtension = /\.(jpe?g)$/i.test(filename);
  return isJpegMime || isJpegExtension;
}

/**
 * Natural (numeric-aware) filename comparison: "image2.jpg" sorts before
 * "image10.jpg", unlike plain lexicographic order. This is the ordering
 * strategy the spec calls for — filenames are the primary, stable source of
 * truth; Drive creation timestamps can shift if a frame is rescanned and
 * re-uploaded later, which filename order does not.
 *
 * Splits each filename into alternating text/number runs and compares
 * run-by-run — numbers numerically, text lexicographically — so it works for
 * any reasonable numbered naming convention, not one specific pattern.
 */
function splitIntoRuns(filename: string): (string | number)[] {
  return filename
    .split(/(\d+)/)
    .filter((part) => part.length > 0)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function compareNatural(a: string, b: string): number {
  const runsA = splitIntoRuns(a);
  const runsB = splitIntoRuns(b);
  const len = Math.max(runsA.length, runsB.length);

  for (let i = 0; i < len; i++) {
    const partA = runsA[i];
    const partB = runsB[i];
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;

    if (typeof partA === "number" && typeof partB === "number") {
      if (partA !== partB) return partA - partB;
      continue;
    }
    const strA = String(partA);
    const strB = String(partB);
    if (strA !== strB) return strA.localeCompare(strB);
  }
  return 0;
}

/**
 * Orders files by natural filename order. Falls back to createdTime only for
 * files whose name has no numeric component at all — nothing to naturally
 * sort by — which is expected to be rare.
 */
export function orderDriveFiles(files: DriveJpegFile[]): DriveJpegFile[] {
  const hasNumber = (name: string) => /\d/.test(name);
  const numbered = files.filter((f) => hasNumber(f.name));
  const unnumbered = files.filter((f) => !hasNumber(f.name));

  numbered.sort((a, b) => compareNatural(a.name, b.name));
  unnumbered.sort((a, b) => {
    const ta = a.createdTime ? Date.parse(a.createdTime) : 0;
    const tb = b.createdTime ? Date.parse(b.createdTime) : 0;
    return ta - tb || a.name.localeCompare(b.name);
  });

  // Numbered files (the expected, reliable case) come first in filename
  // order; any unnumbered stragglers are appended in timestamp order rather
  // than interleaved, since there's no reliable way to interleave them.
  return [...numbered, ...unnumbered];
}

/**
 * Builds the sync preview: positionally pairs sorted frames with sorted
 * files, truncated at the shorter list. Never guesses or shifts pairings —
 * a count mismatch just means some frames or files are left unmatched, shown
 * explicitly rather than silently resolved.
 */
export function buildSyncPreview(
  frames: { id: string; frame_number: number }[],
  files: DriveJpegFile[],
): SyncPreview {
  const sortedFrames = [...frames].sort((a, b) => a.frame_number - b.frame_number);
  const orderedFiles = orderDriveFiles(files);

  const pairCount = Math.min(sortedFrames.length, orderedFiles.length);
  const pairs = sortedFrames.slice(0, pairCount).map((frame, i) => ({
    frameNumber: frame.frame_number,
    frameId: frame.id,
    file: orderedFiles[i],
  }));

  const unmatchedFrameNumbers = sortedFrames.slice(pairCount).map((f) => f.frame_number);
  const unmatchedFileNames = orderedFiles.slice(pairCount).map((f) => f.name);

  return {
    frameCount: sortedFrames.length,
    imageCount: orderedFiles.length,
    pairs,
    unmatchedFrameNumbers,
    unmatchedFileNames,
    countsMatch: sortedFrames.length === orderedFiles.length,
  };
}

/**
 * Requests a larger rendition of the same Drive-generated thumbnail by
 * rewriting its embedded size parameter, rather than adding any new image
 * pipeline. Investigation (Drive API docs + confirmed real thumbnailLink
 * examples): the URL Drive returns already encodes a size — modern URLs as
 * `https://lh3.googleusercontent.com/{id}=s220`, occasionally as a `sz=`
 * query param on an older-style URL — and requesting a larger value serves
 * a bigger rendition of the SAME cached thumbnail, up to roughly the
 * source image's own resolution. No new Drive scope, no server-side
 * fetching, no Supabase storage: this is purely asking Google's existing
 * thumbnail service for a bigger version of what it already generated.
 *
 * Known limitation, worth being upfront about rather than overselling this:
 * Drive's thumbnail pipeline applies its own compression regardless of the
 * requested size, so a large rendition is sharper than the ~220px default
 * but is not the same fidelity as the original scan. Genuinely matching
 * source quality would mean fetching the original file's bytes (an
 * authenticated, much heavier request, and exactly the "full-resolution
 * scans loaded everywhere" outcome this was scoped to avoid) — this is the
 * deliberate middle tier between that and the tiny default.
 */
export function driveThumbnailAtSize(url: string, size: number): string {
  // Modern lh3.googleusercontent.com form: "...=s220" (optionally with
  // further "-c", "-k" etc modifiers after the size) at the end of the URL.
  if (/=s\d+/.test(url)) {
    return url.replace(/=s\d+/, `=s${size}`);
  }
  // Older / alternate form: a "sz=sNNN" (or "sz=wNNN-hNNN") query parameter.
  if (/[?&]sz=/.test(url)) {
    return url.replace(/([?&]sz=)[^&]*/, `$1s${size}`);
  }
  // Unknown shape — append rather than guess-replace, so this never mangles
  // a URL format Drive changes in the future; worst case it's a harmless
  // extra param Drive ignores.
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}sz=s${size}`;
}

/** Grid thumbnails: bigger than Drive's ~220px default (which looks soft on
 * a high-density phone screen even at grid-cell size) without fetching
 * review-scale images for dozens of cells at once. */
export const GRID_THUMBNAIL_SIZE = 400;

/** Frame review: substantially larger, for actually judging exposure, focus, and composition — not a thumbnail anymore, but still far short of the original file. */
export const REVIEW_IMAGE_SIZE = 1280;

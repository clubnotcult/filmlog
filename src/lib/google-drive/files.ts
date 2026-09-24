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

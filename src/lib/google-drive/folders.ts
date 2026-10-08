import { DriveApiError } from "./errors";

/**
 * Drive archive folders.
 *
 * Builds (or finds) the structure for a completed roll:
 *
 *   <archive root> / <year> / <folder name> / { RAW, JPEG, SELECTS }
 *
 * Nothing about the person's layout is hardcoded: the root is whatever folder
 * they chose, the year comes from the roll, and the roll folder is named with
 * the existing generated title.
 *
 * Every level is FIND-OR-CREATE. That one rule is what gives:
 *   - duplicate prevention (a folder that is already there is reused, never
 *     created twice — including one the person made by hand), and
 *   - safe retries after a partial failure (re-running picks up exactly where
 *     the last attempt stopped, and never leaves behind anything it won't reuse).
 *
 * The functions here only talk to Drive. They never touch the database; the
 * caller persists the association only when the whole structure is confirmed.
 *
 * Names are matched by listing a folder's child folders and comparing in code,
 * rather than interpolating a name into a Drive `q` string — so a title with an
 * apostrophe or backslash can never produce a broken or injected query. The
 * only value placed in a query is a folder ID, which is validated first.
 */

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const RAW_FOLDER_NAME = "RAW";
export const JPEG_FOLDER_NAME = "JPEG";
/** The name rolls used before this feature. Accepted wherever JPEG is. */
export const LEGACY_JPEG_FOLDER_NAME = "JPG";
export const SELECTS_FOLDER_NAME = "SELECTS";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const REQUEST_TIMEOUT_MS = 30_000;
const FOLDER_FIELDS = "id,name,mimeType,createdTime,parents,trashed";

export type DriveFolder = {
  id: string;
  name: string;
  createdTime: string | null;
  parents: string[];
};

/** The three calls the structure builder needs. Faked in tests. */
export interface DriveFolderApi {
  /** Throws DriveApiError(404) if missing, trashed, or not a folder. */
  getFolder(id: string): Promise<DriveFolder>;
  listChildFolders(parentId: string): Promise<DriveFolder[]>;
  createFolder(name: string, parentId: string): Promise<DriveFolder>;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

function assertDriveId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid Google Drive folder ID.");
  return id;
}

type RawFolder = {
  id: string;
  name: string;
  mimeType?: string;
  createdTime?: string;
  parents?: string[];
  trashed?: boolean;
};

function toFolder(f: RawFolder): DriveFolder {
  return { id: f.id, name: f.name, createdTime: f.createdTime ?? null, parents: f.parents ?? [] };
}

async function driveRequest<T>(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new DriveApiError(res.status, `Google Drive API error (${res.status})`, text);
    }
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof DriveApiError) throw err;
    // Aborted / offline: no HTTP response at all.
    if (err instanceof TypeError || (err instanceof Error && err.name === "AbortError")) {
      throw new DriveApiError(0, "Couldn't reach Google Drive.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function createDriveFolderApi(token: string, fetchImpl: typeof fetch = fetch): DriveFolderApi {
  return {
    async getFolder(id) {
      const raw = await driveRequest<RawFolder>(
        fetchImpl,
        token,
        `${DRIVE_FILES_ENDPOINT}/${assertDriveId(id)}?fields=${FOLDER_FIELDS}`,
      );
      if (raw.trashed || raw.mimeType !== FOLDER_MIME) {
        throw new DriveApiError(404, "That Drive folder wasn't found.");
      }
      return toFolder(raw);
    },

    async listChildFolders(parentId) {
      const out: DriveFolder[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${assertDriveId(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
          fields: `nextPageToken,files(${FOLDER_FIELDS})`,
          pageSize: "1000",
          spaces: "drive",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const data = await driveRequest<{ nextPageToken?: string; files?: RawFolder[] }>(
          fetchImpl,
          token,
          `${DRIVE_FILES_ENDPOINT}?${params.toString()}`,
        );
        for (const f of data.files ?? []) out.push(toFolder(f));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return out;
    },

    async createFolder(name, parentId) {
      const raw = await driveRequest<RawFolder>(
        fetchImpl,
        token,
        `${DRIVE_FILES_ENDPOINT}?fields=${FOLDER_FIELDS}`,
        {
          method: "POST",
          body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [assertDriveId(parentId)] }),
        },
      );
      return toFolder(raw);
    },
  };
}

// ---------------------------------------------------------------------------
// Structure builder
// ---------------------------------------------------------------------------

export type StructureStepKey = "archive_root" | "year" | "roll" | "raw" | "jpeg" | "selects";
export type StructureOutcome = "found" | "created" | "failed" | "skipped" | "not_attempted";

export type StructureStep = {
  key: StructureStepKey;
  label: string;
  outcome: StructureOutcome;
  folderId?: string;
  folderName?: string;
  detail?: string;
};

export type EnsureStructureInput = {
  rootFolderId: string;
  /** Four-digit year from the roll (its start date). */
  year: string;
  /** The roll folder's name, used verbatim (see drive-folder-name.ts). */
  folderName: string;
  /**
   * For a roll that was already synced: its existing image folder (the
   * rolls.drive_folder_id). Its parent becomes the roll folder and the folder
   * itself is kept as the image folder — it is adopted, never renamed or moved.
   */
  existingImageFolderId?: string | null;
};

export type StructureIds = {
  parent: string;
  parentName: string;
  jpeg: string;
  jpegName: string;
  raw: string;
  selects: string;
};

export type EnsureStructureResult =
  | { ok: true; ids: StructureIds; steps: StructureStep[]; warnings: string[]; adopted: boolean }
  | {
      ok: false;
      reason: "root_missing" | "conflict" | "drive_error";
      message: string;
      /** The underlying error for a drive_error, so the caller can classify auth vs transient. */
      cause?: unknown;
      steps: StructureStep[];
    };

const STEP_LABELS: Record<StructureStepKey, string> = {
  archive_root: "Archive folder",
  year: "Year folder",
  roll: "Roll folder",
  raw: "RAW",
  jpeg: "JPEG",
  selects: "SELECTS",
};

function sameName(a: string, b: string): boolean {
  return a.trim().normalize().toLowerCase() === b.trim().normalize().toLowerCase();
}

function earliest(folders: DriveFolder[]): DriveFolder {
  return [...folders].sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? "") || a.id.localeCompare(b.id))[0];
}

class Conflict extends Error {}

export async function ensureRollFolderStructure(
  api: DriveFolderApi,
  input: EnsureStructureInput,
): Promise<EnsureStructureResult> {
  const steps: StructureStep[] = (Object.keys(STEP_LABELS) as StructureStepKey[]).map((key) => ({
    key,
    label: STEP_LABELS[key],
    outcome: "not_attempted",
  }));
  const step = (key: StructureStepKey) => steps.find((s) => s.key === key)!;
  const warnings: string[] = [];

  const title = input.folderName.trim();
  if (!title) {
    return { ok: false, reason: "conflict", message: "This roll has no folder name.", steps };
  }
  if (!/^\d{4}$/.test(input.year)) {
    return { ok: false, reason: "conflict", message: "This roll has no valid year.", steps };
  }

  const record = (key: StructureStepKey, outcome: StructureOutcome, folder?: DriveFolder, detail?: string) => {
    const s = step(key);
    s.outcome = outcome;
    if (folder) {
      s.folderId = folder.id;
      s.folderName = folder.name;
    }
    if (detail) s.detail = detail;
  };

  /** Find a folder by name among a parent's children, or create it. */
  async function findOrCreate(
    key: StructureStepKey,
    parentId: string,
    names: string[],
    children: DriveFolder[] | null,
  ): Promise<{ folder: DriveFolder; created: boolean }> {
    const list = children ?? (await api.listChildFolders(parentId));
    for (const name of names) {
      const matches = list.filter((f) => sameName(f.name, name));
      if (matches.length > 0) {
        const folder = earliest(matches);
        if (matches.length > 1) {
          warnings.push(`${matches.length} folders named "${folder.name}" exist here; using the oldest.`);
        }
        record(key, "found", folder);
        return { folder, created: false };
      }
    }
    const folder = await api.createFolder(names[0], parentId);
    record(key, "created", folder);
    return { folder, created: true };
  }

  let current: StructureStepKey | null = null;

  try {
    // 1. The archive root must exist and be reachable.
    current = "archive_root";
    let root: DriveFolder;
    try {
      root = await api.getFolder(input.rootFolderId);
    } catch (err) {
      if (err instanceof DriveApiError && err.status === 404) {
        record("archive_root", "failed", undefined, "Not found");
        return {
          ok: false,
          reason: "root_missing",
          message: "Your archive folder wasn't found in Google Drive. Choose it again.",
          cause: err,
          steps,
        };
      }
      throw err;
    }
    record("archive_root", "found", root);

    let parent: DriveFolder;
    let jpeg: DriveFolder;
    let parentChildren: DriveFolder[];
    const adopted = Boolean(input.existingImageFolderId);

    if (input.existingImageFolderId) {
      // 2a. Already-synced roll: keep its image folder, build around it.
      current = "roll";
      jpeg = await api.getFolder(input.existingImageFolderId);
      const parentId = jpeg.parents[0];
      if (!parentId) {
        throw new Conflict("This roll's image folder has no parent folder to organize.");
      }
      if (parentId === root.id) {
        throw new Conflict(
          "This roll's image folder sits directly in your archive folder, so there's no roll folder to add RAW and SELECTS to.",
        );
      }
      const rootChildren = await api.listChildFolders(root.id);
      const yearMatch = rootChildren.find((f) => f.id === parentId);
      if (yearMatch && sameName(yearMatch.name, input.year)) {
        throw new Conflict(
          "This roll's image folder sits directly in the year folder, so there's no roll folder to add RAW and SELECTS to.",
        );
      }
      parent = await api.getFolder(parentId);
      record("year", "skipped", undefined, "Using the roll's existing location");
      record("roll", "found", parent);
      record("jpeg", "found", jpeg);
      current = "raw";
      parentChildren = await api.listChildFolders(parent.id);
    } else {
      // 2b. New structure: year, then roll folder, then JPEG (or the legacy JPG).
      current = "year";
      const year = (await findOrCreate("year", root.id, [input.year], null)).folder;
      current = "roll";
      const roll = await findOrCreate("roll", year.id, [title], null);
      parent = roll.folder;
      current = "jpeg";
      // A folder we just made has no children, so there is nothing to list.
      parentChildren = roll.created ? [] : await api.listChildFolders(parent.id);
      jpeg = (await findOrCreate("jpeg", parent.id, [JPEG_FOLDER_NAME, LEGACY_JPEG_FOLDER_NAME], parentChildren)).folder;
      parentChildren.push(jpeg);
    }

    current = "raw";
    const raw = (await findOrCreate("raw", parent.id, [RAW_FOLDER_NAME], parentChildren)).folder;
    parentChildren.push(raw);
    current = "selects";
    const selects = (await findOrCreate("selects", parent.id, [SELECTS_FOLDER_NAME], parentChildren)).folder;

    return {
      ok: true,
      ids: {
        parent: parent.id,
        parentName: parent.name,
        jpeg: jpeg.id,
        jpegName: jpeg.name,
        raw: raw.id,
        selects: selects.id,
      },
      steps,
      warnings,
      adopted,
    };
  } catch (err) {
    if (current) record(current, "failed", undefined, err instanceof Error ? err.message : "Failed");
    if (err instanceof Conflict) {
      return { ok: false, reason: "conflict", message: err.message, steps };
    }
    return {
      ok: false,
      reason: "drive_error",
      message: err instanceof Error ? err.message : "Google Drive failed.",
      cause: err,
      steps,
    };
  }
}

import { createDriveFolderApi, JPEG_FOLDER_NAME, LEGACY_JPEG_FOLDER_NAME, RAW_FOLDER_NAME, type DriveFolderApi } from "./folders";
import { listFolderJpegs, orderDriveFiles } from "./files";
import { pickDriveFolder } from "./picker";
import type { DriveJpegFile, PickedFolder } from "./types";

export type ImageSource = { folder: PickedFolder; files: DriveJpegFile[] };

/**
 * The folder the archive reads images from. JPEG folders are the source;
 * RAW is organizational only. If the person picks the roll's own folder
 * (the one holding RAW / JPEG / SELECTS), its JPEG folder — or a legacy JPG
 * folder — is used instead, so either choice does the right thing.
 */
export async function resolveImageFolder(api: DriveFolderApi, picked: PickedFolder): Promise<PickedFolder> {
  if (picked.name.trim().toUpperCase() === RAW_FOLDER_NAME) {
    throw new Error("RAW folders aren't read — choose the roll's JPEG folder.");
  }
  const children = await api.listChildFolders(picked.id);
  const byName = (name: string) => children.find((c) => c.name.trim().toUpperCase() === name);
  const jpeg = byName(JPEG_FOLDER_NAME) ?? byName(LEGACY_JPEG_FOLDER_NAME);
  return jpeg ? { id: jpeg.id, name: jpeg.name } : picked;
}

/** Lists a folder's eligible JPEGs in SmartConvert (natural filename) order — never by Drive timestamps. */
export async function readImageSource(token: string, folder: PickedFolder): Promise<ImageSource> {
  const files = orderDriveFiles(await listFolderJpegs(token, folder.id));
  return { folder, files };
}

/** Opens the Drive Picker and returns the resolved image folder with its ordered JPEGs; null if cancelled. */
export async function pickImageSource(token: string): Promise<ImageSource | null> {
  const picked = await pickDriveFolder(token);
  if (!picked) return null;
  const folder = await resolveImageFolder(createDriveFolderApi(token), picked);
  return readImageSource(token, folder);
}

/** Re-reads a folder already linked to a roll, without the picker. */
export async function readLinkedImageSource(token: string, folderId: string): Promise<ImageSource> {
  const folder = await createDriveFolderApi(token).getFolder(folderId);
  return readImageSource(token, { id: folder.id, name: folder.name });
}

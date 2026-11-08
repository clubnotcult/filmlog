/**
 * What the roll detail page shows for Drive archive folders.
 *
 *  - hidden : an archived roll with nothing linked
 *  - create : an open or completed roll with no archive folder yet — in the
 *             image-first workflow a roll stays open while its images are
 *             imported and reviewed, so the RAW / JPEG / SELECTS folders can
 *             be created as soon as the roll exists
 *  - linked : a roll that already has one (or, if archived, a synced photos
 *             folder) — status and "Open in Drive" instead of the create action
 *
 * `driveFolderId` is the synced photos folder (existing behaviour); an
 * already-synced completed roll still gets `create`, which adopts that folder.
 */
export type DriveSectionState =
  | { kind: "hidden" }
  | { kind: "create"; syncedFolderId: string | null }
  | { kind: "linked"; folderCreated: boolean; driveLinked: boolean; openFolderId: string };

export function driveSectionState(roll: {
  status: string;
  drive_parent_folder_id: string | null;
  drive_folder_id: string | null;
}): DriveSectionState {
  if (roll.drive_parent_folder_id) {
    return {
      kind: "linked",
      folderCreated: true,
      driveLinked: Boolean(roll.drive_folder_id),
      openFolderId: roll.drive_parent_folder_id,
    };
  }
  if (roll.status === "active" || roll.status === "completed") {
    return { kind: "create", syncedFolderId: roll.drive_folder_id };
  }
  if (roll.drive_folder_id) {
    return { kind: "linked", folderCreated: false, driveLinked: true, openFolderId: roll.drive_folder_id };
  }
  return { kind: "hidden" };
}

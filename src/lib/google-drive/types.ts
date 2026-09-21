export type PickedFolder = {
  id: string;
  name: string;
};

/** A JPEG file found in the picked folder, as returned by Drive's files.list. */
export type DriveJpegFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink: string | null;
  webViewLink: string | null;
  createdTime: string | null;
};

/** One resolved frame <-> file pairing, ready to send to apply_roll_sync. */
export type SyncMapping = {
  frame_id: string;
  drive_file_id: string;
  drive_filename: string;
  drive_thumbnail_url: string | null;
  drive_view_url: string | null;
};

export type SyncPreview = {
  frameCount: number;
  imageCount: number;
  /** Ordered 1:1 pairings, truncated at the shorter of the two lists. */
  pairs: { frameNumber: number; frameId: string; file: DriveJpegFile }[];
  /** Frames beyond the number of images found — will be left unmapped. */
  unmatchedFrameNumbers: number[];
  /** Images beyond the number of frames — will not be attached to anything. */
  unmatchedFileNames: string[];
  countsMatch: boolean;
};

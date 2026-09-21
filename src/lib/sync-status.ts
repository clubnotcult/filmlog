export type SyncStatus = "unsynced" | "partially_synced" | "synced";

export function computeSyncStatus(frames: { drive_file_id: string | null }[]): SyncStatus {
  if (frames.length === 0) return "unsynced";
  const syncedCount = frames.filter((f) => f.drive_file_id !== null).length;
  if (syncedCount === 0) return "unsynced";
  if (syncedCount === frames.length) return "synced";
  return "partially_synced";
}

export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case "synced":
      return "Synced";
    case "partially_synced":
      return "Partially Synced";
    case "unsynced":
      return "Unsynced";
  }
}

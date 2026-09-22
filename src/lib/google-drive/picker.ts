"use client";

import { loadGooglePicker } from "./scripts";
import { getGoogleDriveEnv } from "./config";
import type { PickedFolder } from "./types";

/**
 * Opens Google Picker restricted to folder selection, per the spec: the
 * person manually picks the JPG folder themselves — this deliberately does
 * not try to auto-discover it. Resolves with the picked folder, or null if
 * the picker was cancelled.
 */
export async function pickDriveFolder(accessToken: string): Promise<PickedFolder | null> {
  await loadGooglePicker();
  const { apiKey, appId } = getGoogleDriveEnv();

  return new Promise<PickedFolder | null>((resolve, reject) => {
    try {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setAppId(appId)
        .setTitle("Select the roll's JPG folder")
        .setCallback((response) => {
          if (response.action === window.google.picker.Action.PICKED) {
            const doc = response.docs?.[0];
            if (doc) {
              resolve({ id: doc.id, name: doc.name });
              return;
            }
          }
          if (response.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to open Google Picker"));
    }
  });
}

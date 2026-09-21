"use client";

/**
 * Lazily loads Google's client-side SDKs, each exactly once, no matter how
 * many times these are called (e.g. re-opening the sync panel). Nothing here
 * touches the network until the person actually clicks "Sync Photos" — these
 * scripts are not loaded on every page.
 */

let gisPromise: Promise<void> | null = null;
let gapiPromise: Promise<void> | null = null;
let pickerModulePromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/** Google Identity Services — provides window.google.accounts.oauth2. */
export function loadGoogleIdentityServices(): Promise<void> {
  if (!gisPromise) {
    gisPromise = loadScript("https://accounts.google.com/gsi/client");
  }
  return gisPromise;
}

/** The legacy `gapi` loader — needed only to pull in the Picker module. */
export function loadGapi(): Promise<void> {
  if (!gapiPromise) {
    gapiPromise = loadScript("https://apis.google.com/js/api.js");
  }
  return gapiPromise;
}

/** Loads the Picker module onto window.google.picker, via gapi.load. */
export async function loadGooglePicker(): Promise<void> {
  if (pickerModulePromise) return pickerModulePromise;
  await loadGapi();
  pickerModulePromise = new Promise((resolve, reject) => {
    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to load Google Picker")),
    });
  });
  return pickerModulePromise;
}

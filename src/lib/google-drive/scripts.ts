"use client";

/**
 * Lazily loads Google's client-side SDKs, each exactly once while it
 * succeeds. Nothing here touches the network until something asks for it.
 *
 * Two properties the earlier version lacked, both of which can leave a UI
 * waiting forever:
 *  - A load that fails is NOT cached. Previously a single failed attempt left
 *    a permanently rejected promise, so every later call failed until the page
 *    was reloaded.
 *  - A load that never finishes (a stalled connection) times out instead of
 *    hanging.
 */

const LOAD_TIMEOUT_MS = 15_000;

let gisPromise: Promise<void> | null = null;
let gapiPromise: Promise<void> | null = null;
let pickerModulePromise: Promise<void> | null = null;

function loadScript(src: string, isReady: () => boolean): Promise<void> {
  if (isReady()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out loading ${src}`)),
      LOAD_TIMEOUT_MS,
    );
    const settle = (fn: () => void) => () => {
      clearTimeout(timer);
      fn();
    };

    // A <script> element can exist without having finished loading (another
    // caller added it moments ago), so wait on its events rather than
    // resolving just because it is in the DOM — the old code did the latter,
    // and could report "ready" before window.google existed.
    const script =
      document.querySelector<HTMLScriptElement>(`script[src="${src}"]`) ??
      Object.assign(document.createElement("script"), { src, async: true, defer: true });

    script.addEventListener("load", settle(resolve));
    script.addEventListener("error", settle(() => reject(new Error(`Failed to load ${src}`))));
    if (!script.isConnected) document.head.appendChild(script);
  });
}

/** True once window.google.accounts.oauth2 exists — i.e. Google's sign-in can be started right now, in the same tick as a tap. */
export function isGoogleIdentityLoaded(): boolean {
  return typeof window !== "undefined" && Boolean((window as Partial<Window>).google?.accounts?.oauth2);
}

/** Google Identity Services — provides window.google.accounts.oauth2. */
export function loadGoogleIdentityServices(): Promise<void> {
  if (isGoogleIdentityLoaded()) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = loadScript("https://accounts.google.com/gsi/client", isGoogleIdentityLoaded).catch((err) => {
      gisPromise = null; // a failed load must be retryable
      throw err;
    });
  }
  return gisPromise;
}

/** The legacy `gapi` loader — needed only to pull in the Picker module. */
export function loadGapi(): Promise<void> {
  if (!gapiPromise) {
    gapiPromise = loadScript("https://apis.google.com/js/api.js", () => typeof window !== "undefined" && Boolean((window as Partial<Window>).gapi)).catch((err) => {
      gapiPromise = null;
      throw err;
    });
  }
  return gapiPromise;
}

/** Loads the Picker module onto window.google.picker, via gapi.load. */
export async function loadGooglePicker(): Promise<void> {
  if (pickerModulePromise) return pickerModulePromise;
  await loadGapi();
  pickerModulePromise = new Promise<void>((resolve, reject) => {
    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to load Google Picker")),
    });
  }).catch((err) => {
    pickerModulePromise = null;
    throw err;
  });
  return pickerModulePromise;
}

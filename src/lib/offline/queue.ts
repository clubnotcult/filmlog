"use client";

/**
 * A minimal IndexedDB wrapper for exactly one purpose: queuing "save this
 * frame" writes made while offline, so they aren't lost and flush
 * automatically once the connection returns. Uses the native browser
 * IndexedDB API directly — no dependency — since the actual need here is
 * small (one object store, a handful of operations).
 *
 * Deliberately scoped narrower than "offline-first PWA": this does not cache
 * pages or app-shell assets for a cold offline load (that's a service-worker
 * project of its own, with real failure modes that can't be verified without
 * live testing). What it does solve is the concern that actually risks data
 * loss — losing a shot's exposure log because the network happened to be
 * down for the few seconds it takes to tap NEXT FRAME.
 */

const DB_NAME = "filmlog-offline";
const DB_VERSION = 1;
const STORE = "pending-frame-saves";

export type PendingFrameSave = {
  /** A client-generated id, stable for this queue entry until it's confirmed synced. */
  localId: string;
  rollId: string;
  queuedAt: number;
  input: {
    metadataLogged: boolean;
    shutterSpeed: string | null;
    aperture: number | null;
    lensId: string | null;
    pushPull: number | null;
    notes: string | null;
    meterType: string | null;
    locationId: string | null;
  };
  /** The frame number this was composed against, for display only — the server always computes the real one on flush. */
  optimisticFrameNumber: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueuePendingSave(entry: PendingFrameSave): Promise<void> {
  await withStore("readwrite", (store) => store.put(entry));
}

export async function listPendingSaves(rollId: string): Promise<PendingFrameSave[]> {
  try {
    const all = await withStore<PendingFrameSave[]>("readonly", (store) => store.getAll());
    return all.filter((e) => e.rollId === rollId).sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [];
  }
}

export async function removePendingSave(localId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(localId));
}

/** Best-effort — IndexedDB isn't available during SSR, and some environments (private browsing) may block it entirely. */
export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

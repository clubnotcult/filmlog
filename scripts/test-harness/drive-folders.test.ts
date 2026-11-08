// Run: npx tsx --test scripts/test-harness/drive-folders.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDriveFolderApi,
  ensureRollFolderStructure,
  type DriveFolder,
  type DriveFolderApi,
} from "../../src/lib/google-drive/folders";
import { createAndLinkRollFolders } from "../../src/lib/google-drive/create-roll-folders";
import { DriveApiError } from "../../src/lib/google-drive/errors";
import { GOOGLE_DRIVE_SCOPE } from "../../src/lib/google-drive/config";
import { listFolderJpegs } from "../../src/lib/google-drive/files";

// ---- In-memory Drive -------------------------------------------------------
class FakeDrive implements DriveFolderApi {
  folders = new Map<string, DriveFolder>();
  creates: { name: string; parentId: string }[] = [];
  lists: string[] = [];
  n = 0;
  failCreate: ((name: string) => unknown) | null = null;
  seq = 0;
  add(name: string, parentId: string | null, id?: string): DriveFolder {
    const f: DriveFolder = {
      id: id ?? `F${++this.n}`,
      name,
      createdTime: `2026-01-01T00:00:${String(++this.seq).padStart(2, "0")}Z`,
      parents: parentId ? [parentId] : [],
    };
    this.folders.set(f.id, f);
    return f;
  }
  async getFolder(id: string) {
    const f = this.folders.get(id);
    if (!f) throw new DriveApiError(404, "nf");
    return f;
  }
  async listChildFolders(parentId: string) {
    this.lists.push(parentId);
    return [...this.folders.values()].filter((f) => f.parents.includes(parentId));
  }
  async createFolder(name: string, parentId: string) {
    if (this.failCreate) {
      const e = this.failCreate(name);
      if (e) throw e;
    }
    this.creates.push({ name, parentId });
    return this.add(name, parentId);
  }
  children(id: string) {
    return [...this.folders.values()].filter((f) => f.parents.includes(id)).map((f) => f.name).sort();
  }
}

const TITLE = "9.28_10.2_JHCStreetPan_ATX";
function base() {
  const d = new FakeDrive();
  d.add("35mm", "MYDRIVE", "ROOT");
  return d;
}
const input = (extra = {}) => ({ rootFolderId: "ROOT", year: "2026", folderName: TITLE, ...extra });

test("fresh structure: year, exact-name roll folder, RAW/JPEG/SELECTS in the right parents", async () => {
  const d = base();
  const r = await ensureRollFolderStructure(d, input());
  assert.ok(r.ok);
  const year = [...d.folders.values()].find((f) => f.name === "2026")!;
  assert.deepEqual(year.parents, ["ROOT"]);
  const roll = d.folders.get(r.ids.parent)!;
  assert.equal(roll.name, TITLE); // exact folder name
  assert.deepEqual(roll.parents, [year.id]);
  assert.deepEqual(d.children(roll.id), ["JPEG", "RAW", "SELECTS"]);
  assert.equal(d.folders.get(r.ids.jpeg)!.name, "JPEG");
  assert.equal(r.adopted, false);
  assert.equal(d.creates.length, 5);
});

test("year comes from the roll: a 2025 roll goes in 2025, not a hardcoded year", async () => {
  const d = base();
  await ensureRollFolderStructure(d, input({ year: "2025" }));
  assert.ok([...d.folders.values()].some((f) => f.name === "2025"));
  assert.ok(![...d.folders.values()].some((f) => f.name === "2026"));
});

test("existing year folder is reused, not duplicated", async () => {
  const d = base();
  const y = d.add("2026", "ROOT");
  const r = await ensureRollFolderStructure(d, input());
  assert.ok(r.ok);
  assert.equal([...d.folders.values()].filter((f) => f.name === "2026").length, 1);
  assert.deepEqual(d.folders.get(r.ids.parent)!.parents, [y.id]);
});

test("a roll folder already in the expected location is adopted; only missing children are created", async () => {
  const d = base();
  const y = d.add("2026", "ROOT");
  const roll = d.add(TITLE, y.id);
  d.add("RAW", roll.id);
  const r = await ensureRollFolderStructure(d, input());
  assert.ok(r.ok);
  assert.equal(r.ids.parent, roll.id);
  assert.deepEqual(d.creates.map((c) => c.name).sort(), ["JPEG", "SELECTS"]);
});

test("legacy JPG folder is accepted as the image folder (no JPEG created beside it)", async () => {
  const d = base();
  const y = d.add("2026", "ROOT");
  const roll = d.add(TITLE, y.id);
  const jpg = d.add("JPG", roll.id);
  const r = await ensureRollFolderStructure(d, input());
  assert.ok(r.ok);
  assert.equal(r.ids.jpeg, jpg.id);
  assert.ok(!d.creates.some((c) => c.name === "JPEG"));
});

test("running twice is idempotent: same ids, nothing created the second time", async () => {
  const d = base();
  const a = await ensureRollFolderStructure(d, input());
  const before = d.creates.length;
  const b = await ensureRollFolderStructure(d, input());
  assert.ok(a.ok && b.ok);
  assert.deepEqual(a.ids, b.ids);
  assert.equal(d.creates.length, before);
});

test("duplicate same-name folders: oldest wins, with a warning", async () => {
  const d = base();
  const y = d.add("2026", "ROOT");
  const first = d.add(TITLE, y.id);
  d.add(TITLE, y.id);
  const r = await ensureRollFolderStructure(d, input());
  assert.ok(r.ok);
  assert.equal(r.ids.parent, first.id);
  assert.equal(r.warnings.length, 1);
});

test("titles with quotes/backslashes are never put in a query and are created verbatim", async () => {
  const urls: string[] = [];
  const bodies: string[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    urls.push(String(url));
    if (init?.body) bodies.push(String(init.body));
    const u = new URL(String(url));
    if (init?.method === "POST") return new Response(JSON.stringify({ id: "NEW", name: "x", parents: ["P"] }), { status: 200 });
    if (u.pathname.endsWith("/ROOT")) return new Response(JSON.stringify({ id: "ROOT", name: "r", mimeType: "application/vnd.google-apps.folder", parents: [] }), { status: 200 });
    return new Response(JSON.stringify({ files: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  const api = createDriveFolderApi("tok", fakeFetch);
  const evil = "Dad's \\ roll";
  const r = await ensureRollFolderStructure(api, input({ folderName: evil }));
  assert.ok(r.ok);
  assert.ok(!urls.some((u) => decodeURIComponent(u).includes("Dad")));
  assert.ok(bodies.some((b) => JSON.parse(b).name === evil));
});

test("real API layer: auth header, folder mime + parent on create, id validation, pagination", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let page = 0;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === "POST") return new Response(JSON.stringify({ id: "N", name: "A", parents: ["P1"] }), { status: 200 });
    page++;
    return new Response(
      JSON.stringify(page === 1 ? { nextPageToken: "t2", files: [{ id: "a", name: "A" }] } : { files: [{ id: "b", name: "B" }] }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  const api = createDriveFolderApi("tok", fakeFetch);
  assert.equal((await api.listChildFolders("P1")).length, 2);
  assert.match(decodeURIComponent(calls[0].url.replace(/\+/g, ' ')), /'P1' in parents and mimeType = 'application\/vnd.google-apps.folder' and trashed = false/);
  assert.match(calls[1].url, /pageToken=t2/);
  await api.createFolder("A", "P1");
  const post = calls[2];
  assert.equal((post.init!.headers as Record<string, string>).Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(String(post.init!.body)), { name: "A", mimeType: "application/vnd.google-apps.folder", parents: ["P1"] });
  await assert.rejects(api.listChildFolders("x' or name contains '"), /Invalid Google Drive folder ID/);
});

test("trashed or non-folder root is treated as missing", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ id: "R", name: "r", mimeType: "application/vnd.google-apps.folder", trashed: true }), { status: 200 })) as unknown as typeof fetch;
  const api = createDriveFolderApi("tok", fakeFetch);
  const r = await ensureRollFolderStructure(api, input());
  assert.ok(!r.ok && r.reason === "root_missing");
});

test("missing archive root: reported, nothing created", async () => {
  const d = new FakeDrive();
  const r = await ensureRollFolderStructure(d, input());
  assert.ok(!r.ok && r.reason === "root_missing");
  assert.equal(d.creates.length, 0);
});

test("partial failure: reports what worked and failed, nothing linked, retry completes without duplicates", async () => {
  const d = base();
  let linked = 0;
  const link = async () => (linked++, { ok: true as const, data: { alreadyLinked: false } });
  d.failCreate = (name) => (name === "RAW" ? new DriveApiError(500, "boom") : null);
  const a = await createAndLinkRollFolders({ api: d, input: input(), link });
  assert.equal(a.kind, "failed");
  if (a.kind !== "failed") return;
  const by = Object.fromEntries(a.steps.map((s) => [s.key, s.outcome]));
  assert.deepEqual(by, { archive_root: "found", year: "created", roll: "created", jpeg: "created", raw: "failed", selects: "not_attempted" });
  assert.equal(a.problem, "transient");
  assert.equal(linked, 0); // no ambiguous roll state
  d.failCreate = null;
  const b = await createAndLinkRollFolders({ api: d, input: input(), link });
  assert.equal(b.kind, "linked");
  assert.equal(linked, 1);
  assert.deepEqual(d.creates.map((c) => c.name), ["2026", TITLE, "JPEG", "RAW", "SELECTS"]); // each exactly once
});

test("save failure after Drive success: reported, retry reuses the folders", async () => {
  const d = base();
  let fail = true;
  const link = async () => (fail ? { ok: false as const, error: "db down" } : { ok: true as const, data: { alreadyLinked: false } });
  const a = await createAndLinkRollFolders({ api: d, input: input(), link });
  assert.ok(a.kind === "failed" && a.problem === "not_saved");
  const n = d.creates.length;
  fail = false;
  const b = await createAndLinkRollFolders({ api: d, input: input(), link });
  assert.equal(b.kind, "linked");
  assert.equal(d.creates.length, n);
});

test("already linked by another tab: succeeds quietly with alreadyLinked", async () => {
  const d = base();
  const r = await createAndLinkRollFolders({ api: d, input: input(), link: async () => ({ ok: true, data: { alreadyLinked: true } }) });
  assert.ok(r.kind === "linked" && r.alreadyLinked);
});

test("error classification: 401/403 = reconnect, 404 on create parent = missing, offline/5xx = transient", async () => {
  const cases: [DriveApiError, string][] = [
    [new DriveApiError(401, "x"), "auth"],
    [new DriveApiError(403, "x", "insufficientPermissions"), "auth"],
    [new DriveApiError(403, "x", "userRateLimitExceeded"), "transient"],
    [new DriveApiError(0, "offline"), "transient"],
    [new DriveApiError(503, "x"), "transient"],
  ];
  for (const [err, expected] of cases) {
    const d = base();
    d.failCreate = () => err;
    const r = await createAndLinkRollFolders({ api: d, input: input(), link: async () => ({ ok: true, data: { alreadyLinked: false } }) });
    assert.ok(r.kind === "failed" && r.problem === expected, `${err.status} -> ${expected}`);
    assert.equal(r.kind === "failed" && r.steps.find((s) => s.key === "year")!.outcome, "failed");
  }
});

test("bad input: empty title and invalid year are refused before touching Drive", async () => {
  const d = base();
  const a = await ensureRollFolderStructure(d, input({ folderName: "   " }));
  const b = await ensureRollFolderStructure(d, input({ year: "26" }));
  assert.ok(!a.ok && !b.ok);
  assert.equal(d.lists.length + d.creates.length, 0);
});

// ---- Existing synced / imported rolls -------------------------------------
test("existing synced roll: its JPG folder is adopted in place; RAW and SELECTS are added beside it", async () => {
  const d = base();
  const y = d.add("2026", "ROOT");
  const oldRoll = d.add("9.10_9.12_Portra400_ATX_MaddieCatsKendrickPMC", y.id);
  const jpg = d.add("JPG", oldRoll.id, "JPGID");
  const r = await ensureRollFolderStructure(d, input({ existingImageFolderId: "JPGID" }));
  assert.ok(r.ok && r.adopted);
  assert.equal(r.ids.parent, oldRoll.id);
  assert.equal(r.ids.jpeg, jpg.id); // sync folder unchanged
  assert.equal(d.folders.get(jpg.id)!.name, "JPG"); // not renamed
  assert.equal(d.folders.get(oldRoll.id)!.name, "9.10_9.12_Portra400_ATX_MaddieCatsKendrickPMC");
  assert.deepEqual(d.creates.map((c) => c.name).sort(), ["RAW", "SELECTS"]);
});

test("adoption refuses to treat the archive root or the year folder as a roll folder", async () => {
  const d = base();
  const y = d.add("2026", "ROOT");
  d.add("JPG", "ROOT", "INROOT");
  d.add("JPG", y.id, "INYEAR");
  for (const id of ["INROOT", "INYEAR"]) {
    const r = await ensureRollFolderStructure(d, input({ existingImageFolderId: id }));
    assert.ok(!r.ok && r.reason === "conflict", id);
  }
  assert.equal(d.creates.length, 0);
});

test("adoption: missing image folder is reported as a Drive failure, nothing created", async () => {
  const d = base();
  const r = await ensureRollFolderStructure(d, input({ existingImageFolderId: "GONE" }));
  assert.ok(!r.ok && r.reason === "drive_error");
  assert.equal(d.creates.length, 0);
});

// ---- Compatibility ---------------------------------------------------------
test("JPEG sync compatibility: image listing depends on the folder ID only, not its name", async () => {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    seen.push(decodeURIComponent(String(url).replace(/\+/g, " ")));
    return new Response(
      JSON.stringify({ files: [{ id: "1", name: "00001.jpg", mimeType: "image/jpeg" }, { id: "2", name: "x.tif", mimeType: "image/tiff" }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const files = await listFolderJpegs("tok", "NEWFOLDERID");
    assert.deepEqual(files.map((f) => f.id), ["1"]);
    assert.match(seen[0], /'NEWFOLDERID' in parents/);
    assert.ok(!/JPG|JPEG/.test(seen[0].replace(/image\/jpeg/g, "")));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("scope: a single full-drive scope (folder creation needs it), no leftover narrower scopes", () => {
  assert.equal(GOOGLE_DRIVE_SCOPE, "https://www.googleapis.com/auth/drive");
});

// ---- Roll detail visibility ------------------------------------------------
import { driveSectionState } from "../../src/lib/drive-section";
test("visibility: create on open or completed rolls without a folder; linked replaces create", () => {
  const r = (status: string, parent: string | null, synced: string | null) =>
    driveSectionState({ status, drive_parent_folder_id: parent, drive_folder_id: synced });
  // Image-first: an open roll is where images get imported, so folders can be made right away.
  assert.equal(r("active", null, null).kind, "create");
  assert.equal(r("active", "P", "S").kind, "linked"); // reopened roll keeps showing its links
  assert.deepEqual(r("completed", null, null), { kind: "create", syncedFolderId: null });
  assert.deepEqual(r("completed", null, "S"), { kind: "create", syncedFolderId: "S" }); // synced/imported: adopt
  assert.deepEqual(r("completed", "P", null), { kind: "linked", folderCreated: true, driveLinked: false, openFolderId: "P" });
  assert.deepEqual(r("completed", "P", "S"), { kind: "linked", folderCreated: true, driveLinked: true, openFolderId: "P" });
  assert.equal(r("archived", null, null).kind, "hidden");
  assert.deepEqual(r("archived", null, "S"), { kind: "linked", folderCreated: false, driveLinked: true, openFolderId: "S" });
});

import { generateDriveFolderName } from "../../src/lib/drive-folder-name";
test("folder name: date range + squashed film stock + locations", () => {
  const n = (o: Partial<Parameters<typeof generateDriveFolderName>[0]> = {}) =>
    generateDriveFolderName({ startDate: "2026-09-28", endDate: "2026-10-02", filmStockName: "JHC Street Pan", locationNames: ["ATX"], ...o });
  assert.equal(n(), "9.28_10.2_JHCStreetPan_ATX");
  assert.equal(n({ startDate: "2026-09-10", endDate: "2026-09-12", filmStockName: "Portra 400" }), "9.10_9.12_Portra400_ATX");
  assert.equal(n({ endDate: "2026-09-28" }), "9.28_JHCStreetPan_ATX"); // one-day roll
  assert.equal(n({ endDate: null }), "9.28_JHCStreetPan_ATX");
  assert.equal(n({ locationNames: [] }), "9.28_10.2_JHCStreetPan");
  assert.equal(n({ locationNames: ["Austin, TX", "NYC", "nyc", "Austin, TX"] }), "9.28_10.2_JHCStreetPan_AustinTX-NYC");
  assert.equal(n({ filmStockName: "Kodak Tri-X 400" }), "9.28_10.2_KodakTriX400_ATX");
});

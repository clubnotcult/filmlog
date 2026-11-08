// Run: npx tsx --test scripts/test-harness/image-first.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { effectiveLensId, effectiveLocationId, effectiveUserTags } from "../../src/lib/effective-metadata";
import { apertureApplies, shutterApplies } from "../../src/lib/camera-exposure";
import {
  cardBackground,
  cardTextColor,
  defaultFilmCardDesign,
  parseFilmCardDesign,
  type FilmCardDesign,
} from "../../src/lib/film-card";
import { parseExploreFilters, searchFrames, searchFrameIds } from "../../src/lib/explore/search";
import { gatherExportRows } from "../../src/lib/export/gather";
import { toAiAnalysisText, toCsv } from "../../src/lib/export/formats";
import { orderDriveFiles } from "../../src/lib/google-drive/files";
import { resolveImageFolder } from "../../src/lib/google-drive/image-source";
import type { DriveFolderApi } from "../../src/lib/google-drive/folders";
import type { DriveJpegFile } from "../../src/lib/google-drive/types";
import { fakeSupabase } from "./fake-supabase";

// ---- inheritance -----------------------------------------------------------
test("frame lens overrides the roll default; otherwise inherited; otherwise unknown", () => {
  const roll = { default_lens_id: "fd50", location_id: "panama" };
  assert.deepEqual(effectiveLensId({ lens_id: "fd28" }, roll), { value: "fd28", source: "frame" });
  assert.deepEqual(effectiveLensId({ lens_id: null }, roll), { value: "fd50", source: "roll" });
  assert.deepEqual(effectiveLensId({ lens_id: null }, { default_lens_id: null }), { value: null, source: null });
  assert.deepEqual(effectiveLocationId({ location_id: null }, roll), { value: "panama", source: "roll" });
});

test("changing the roll default changes inherited frames only", () => {
  const frames = [{ lens_id: null }, { lens_id: "fd28" }];
  const after = frames.map((f) => effectiveLensId(f, { default_lens_id: "fd35" }).value);
  assert.deepEqual(after, ["fd35", "fd28"]);
});

test("effective tags: roll ∪ frame, de-duplicated, independent frame copy reported as frame", () => {
  const tags = effectiveUserTags(["Panama", "WBC", "travel"], ["panama", "Julian"]);
  assert.deepEqual(tags.map((t) => `${t.name}:${t.source}`), ["panama:frame", "WBC:roll", "travel:roll", "Julian:frame"]);
  // Removing Panama from the roll leaves the frame's own copy.
  const after = effectiveUserTags(["WBC", "travel"], ["panama", "Julian"]);
  assert.ok(after.some((t) => t.name === "panama" && t.source === "frame"));
});

// ---- compact cameras ---------------------------------------------------------
test("exposure control decides which settings apply", () => {
  assert.ok(shutterApplies("manual") && apertureApplies("manual"));
  assert.ok(!shutterApplies("automatic") && !apertureApplies("automatic"));
  assert.ok(!shutterApplies("aperture_priority") && apertureApplies("aperture_priority"));
  assert.ok(shutterApplies("shutter_priority") && !apertureApplies("shutter_priority"));
  assert.ok(shutterApplies(undefined) && apertureApplies(null), "legacy cameras behave as manual");
});

// ---- film cards (detailed coverage in film-card-text.test.ts) ----------------
test("card design parsing: 1–3 hex colors, enum fallbacks, null without colors", () => {
  assert.equal(parseFilmCardDesign(null), null);
  assert.equal(parseFilmCardDesign({ colors: [] }), null);
  assert.equal(parseFilmCardDesign("not json"), null);
  const d = parseFilmCardDesign({ colors: ["#FF0000", "bad", "#00ff00", "#0000ff", "#ffffff"], layout: "weird", text: "  portra 400 " })!;
  assert.deepEqual(d.colors, ["#ff0000", "#00ff00", "#0000ff"]);
  assert.equal(d.layout, "rows");
  assert.equal(d.texts[0].content, "portra 400");
});

test("rows render hard bands; gradient blends; one color is flat", () => {
  const base = defaultFilmCardDesign("Tri-X");
  const one: FilmCardDesign = { ...base, colors: ["#123456"] };
  assert.equal(cardBackground(one), "#123456");
  const rows = cardBackground({ ...base, colors: ["#ff0000", "#0000ff"], layout: "rows" });
  assert.match(rows, /#ff0000 0\.000%, #ff0000 50\.000%, #0000ff 50\.000%, #0000ff 100\.000%/);
  const three = cardBackground({ ...base, colors: ["#ff0000", "#00ff00", "#0000ff"], layout: "gradient", direction: "vertical" });
  assert.equal(three, "linear-gradient(90deg, #ff0000, #00ff00, #0000ff)");
});

test("auto text color reads on the band under the text", () => {
  const base = defaultFilmCardDesign("x");
  const t = (position: "top" | "bottom", tone: "auto" | "dark" = "auto") => ({ content: "X", position, rotation: 0 as const, tone });
  assert.equal(cardTextColor({ ...base, colors: ["#ffd400", "#111111"] }, t("bottom")), "#ffffff");
  assert.equal(cardTextColor({ ...base, colors: ["#ffd400", "#111111"] }, t("top")), "#111111");
  assert.equal(cardTextColor({ ...base, colors: ["#111111"] }, t("top", "dark")), "#111111");
});

// ---- SmartConvert ordering ---------------------------------------------------
test("SmartConvert names sort numerically, not alphabetically or by timestamp", () => {
  const f = (name: string, createdTime: string): DriveJpegFile => ({
    id: name, name, mimeType: "image/jpeg", thumbnailLink: null, webViewLink: null, createdTime,
  });
  const ordered = orderDriveFiles([
    f("847261910.jpg", "2026-01-01T00:00:03Z"),
    f("84726199.jpg", "2026-01-01T00:00:01Z"),
    f("847261911.jpg", "2026-01-01T00:00:02Z"),
  ]);
  assert.deepEqual(ordered.map((x) => x.name), ["84726199.jpg", "847261910.jpg", "847261911.jpg"]);
});

// ---- image folder resolution -------------------------------------------------
test("picking the roll folder descends into JPEG (or legacy JPG); RAW is refused", async () => {
  const api = (children: string[]): DriveFolderApi => ({
    getFolder: async () => { throw new Error("unused"); },
    listChildFolders: async () => children.map((name) => ({ id: `id-${name}`, name, createdTime: null, parents: [] })),
    createFolder: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(await resolveImageFolder(api(["RAW", "JPEG", "SELECTS"]), { id: "roll", name: "9.10_Portra400" }), { id: "id-JPEG", name: "JPEG" });
  assert.deepEqual(await resolveImageFolder(api(["JPG"]), { id: "roll", name: "old roll" }), { id: "id-JPG", name: "JPG" });
  assert.deepEqual(await resolveImageFolder(api([]), { id: "jpeg", name: "JPEG" }), { id: "jpeg", name: "JPEG" });
  await assert.rejects(resolveImageFolder(api([]), { id: "raw", name: "RAW" }), /RAW folders/);
});

// ---- Explore & export with inheritance --------------------------------------
const rolls = [
  { id: "r1", film_stock_id: "portra", camera_id: "f1", default_lens_id: "fd50", location_id: "panama", start_date: "2026-11-01", end_date: "2026-11-07", custom_title: "WBC" },
  { id: "r2", film_stock_id: "portra", camera_id: "af1", default_lens_id: null, location_id: null, start_date: "2026-11-02", end_date: null, custom_title: null },
];
const frame = (id: string, roll_id: string, n: number, extra: Record<string, unknown> = {}) => ({
  id, roll_id, frame_number: n, created_at: `2026-11-0${n}T00:00:00Z`, lens_id: null, location_id: null,
  shutter_speed: null, aperture: null, meter_type: null, metadata_logged: false, notes: null,
  exposure_evaluation: null, selection: null, drive_file_id: `drv-${id}`, drive_filename: `${id}.jpg`, ...extra,
});
const frames = [
  frame("a1", "r1", 1),
  frame("a2", "r1", 2, { lens_id: "fd28", location_id: "colon" }),
  frame("b1", "r2", 3),
];
const db = () =>
  fakeSupabase({
    rolls,
    frames,
    film_stocks: [{ id: "portra", name: "Portra 400", iso: 400, format: "35mm", film_type: "color_negative" }],
    cameras: [
      { id: "f1", name: "Canon New F-1", exposure_control: "manual" },
      { id: "af1", name: "Olympus AF-1", exposure_control: "automatic" },
    ],
    lenses: [
      { id: "fd50", name: "FD 50mm f/1.4", focal_length: "50mm" },
      { id: "fd28", name: "FD 28mm f/2.8", focal_length: "28mm" },
    ],
    locations: [{ id: "panama", name: "Panama City" }, { id: "colon", name: "Colón" }],
    tags: [],
    frame_tags: [{ frame_id: "a2", tag_id: "t-julian", tags: { name: "Julian" } }],
    roll_tags: [{ roll_id: "r1", tag_id: "t-wbc", tags: { name: "WBC" } }],
  });

test("Explore lens filter matches inherited lenses, not overridden frames", async () => {
  const ids = async (p: Record<string, string>) => (await searchFrameIds(db(), parseExploreFilters(p))).map((f) => f.id).sort();
  assert.deepEqual(await ids({ lens: "fd50" }), ["a1"]);
  assert.deepEqual(await ids({ lens: "fd28" }), ["a2"]);
  assert.deepEqual(await ids({ focal: "50mm" }), ["a1"]);
  assert.deepEqual(await ids({ loc: "panama" }), ["a1"]);
  assert.deepEqual(await ids({ loc: "colon" }), ["a2"]);
});

test("Explore tag filter includes roll-level global tags", async () => {
  const wbc = await searchFrames(db(), parseExploreFilters({ tag: "t-wbc" }));
  assert.deepEqual(wbc.frames.map((f) => f.id).sort(), ["a1", "a2"]);
  const julian = await searchFrames(db(), parseExploreFilters({ tag: "t-julian" }));
  assert.deepEqual(julian.frames.map((f) => f.id), ["a2"]);
});

test("AI export carries effective metadata and never invents exposure", async () => {
  const rows = await gatherExportRows(db());
  const a1 = rows.find((r) => r.driveFilename === "a1.jpg")!;
  assert.equal(a1.lens, "FD 50mm f/1.4");
  assert.equal(a1.lensSource, "roll");
  assert.equal(a1.location, "Panama City");
  assert.deepEqual(a1.globalTags, ["WBC"]);
  assert.equal(a1.rollTitle, "11.1–11.7 · Portra 400 · WBC");
  assert.equal(a1.rollEndDate, "2026-11-07");
  assert.equal(a1.filmType, "Color Negative");
  const a2 = rows.find((r) => r.driveFilename === "a2.jpg")!;
  assert.equal(a2.lens, "FD 28mm f/2.8");
  assert.equal(a2.lensSource, "frame");
  assert.deepEqual(a2.tags.sort(), ["Julian", "WBC"]);
  const b1 = rows.find((r) => r.driveFilename === "b1.jpg")!;
  assert.equal(b1.lens, null, "no default lens -> unknown, never inferred");
  assert.equal(b1.shutterApplicable, false);

  const text = toAiAnalysisText(rows);
  assert.match(text, /b1\.jpg .*Olympus AF-1 \(Automatic\) \| unknown \| not applicable \| not applicable/);
  assert.match(text, /a1\.jpg .*FD 50mm f\/1\.4 \(50mm\) \| unknown \| unknown/);
  const csv = toCsv(rows);
  assert.match(csv.split("\n")[0], /drive_filename.*lens_source.*location.*global_tags,frame_tags/);
  assert.ok(csv.includes("not_applicable"));
});

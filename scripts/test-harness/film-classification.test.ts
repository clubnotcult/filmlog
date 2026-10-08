// Run: npx tsx --test scripts/test-harness/film-classification.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { computeSystemTags, combineTagsForDrive } from "../../src/lib/tags/system-tags";
import { parseExploreFilters, searchFrames, searchFrameIds } from "../../src/lib/explore/search";
import { gatherExportRows } from "../../src/lib/export/gather";
import { toAiAnalysisText, toCsv, toJson } from "../../src/lib/export/formats";
import { FILM_FORMATS, FILM_TYPES, filmTypeLabel, isFilmFormat, isFilmType } from "../../src/lib/film-classification";

// ---- tiny in-memory Supabase (only the query methods the code uses) ---------
type Row = Record<string, unknown>;
function fakeSupabase(tables: Record<string, Row[]>) {
  class Q {
    rows: Row[];
    constructor(public t: string) { this.rows = [...(tables[t] ?? [])]; }
    select() { return this; }
    eq(c: string, v: unknown) { this.rows = this.rows.filter((r) => r[c] === v); return this; }
    in(c: string, vs: unknown[]) { this.rows = this.rows.filter((r) => vs.includes(r[c])); return this; }
    gte(c: string, v: string) { this.rows = this.rows.filter((r) => String(r[c]) >= v); return this; }
    lte(c: string, v: string) { this.rows = this.rows.filter((r) => String(r[c]) <= v); return this; }
    not(c: string, _op: string, v: unknown) { this.rows = this.rows.filter((r) => r[c] !== v); return this; }
    order(c: string, o: { ascending: boolean }) {
      this.rows.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (o.ascending ? 1 : -1));
      return this;
    }
    limit(n: number) { this.rows = this.rows.slice(0, n); return this; }
    range(a: number, b: number) { this.total = this.rows.length; this.rows = this.rows.slice(a, b + 1); return this; }
    total: number | null = null;
    then(res: (v: { data: Row[]; count: number }) => unknown) {
      return Promise.resolve({ data: this.rows, count: this.total ?? this.rows.length }).then(res);
    }
  }
  return { from: (t: string) => new Q(t) } as never;
}

const stocks = [
  { id: "portra", name: "Portra 400", iso: 400, format: "35mm", film_type: "color_negative" },
  { id: "trix", name: "Tri-X 400", iso: 400, format: "35mm", film_type: "bw_negative" },
  { id: "e100", name: "Ektachrome E100", iso: 100, format: "35mm", film_type: "color_slide" },
  { id: "portra120", name: "Portra 160", iso: 160, format: "120", film_type: "color_negative" },
  { id: "old", name: "Old Mystery", iso: null, format: null, film_type: null },
];
const rolls = [
  { id: "r1", film_stock_id: "portra", camera_id: "cam", start_date: "2026-09-10", end_date: null, custom_title: null },
  { id: "r2", film_stock_id: "trix", camera_id: "cam", start_date: "2026-09-11", end_date: null, custom_title: null },
  { id: "r3", film_stock_id: "e100", camera_id: "cam", start_date: "2026-09-12", end_date: null, custom_title: null },
  { id: "r4", film_stock_id: "portra120", camera_id: "cam", start_date: "2026-09-13", end_date: null, custom_title: null },
  { id: "r5", film_stock_id: "old", camera_id: "cam", start_date: "2026-09-14", end_date: null, custom_title: null },
];
let n = 0;
const frames = rolls.map((r) => ({
  id: `f-${r.id}`, roll_id: r.id, frame_number: 1, created_at: `2026-10-0${++n}T00:00:00Z`,
  lens_id: null, shutter_speed: "1/125", aperture: 8, meter_type: null, metadata_logged: true, notes: null,
  exposure_evaluation: null, selection: null, drive_file_id: `drv-${r.id}`, location_id: null,
}));
const db = () => fakeSupabase({ film_stocks: stocks, rolls, frames, cameras: [{ id: "cam", name: "Canon A-1" }], lenses: [], frame_tags: [] });

// ---- vocab ---------------------------------------------------------------
test("controlled lists match the spec", () => {
  assert.deepEqual(FILM_TYPES.map((t) => t.label), ["Color Negative", "Black & White Negative", "Color Slide", "Black & White Reversal", "Instant", "Other"]);
  assert.deepEqual(FILM_FORMATS.map((f) => f.label), ["35mm", "120", "Large Format", "Half Frame", "APS", "Instant", "Other"]);
  assert.ok(isFilmType("bw_negative") && !isFilmType("B&W") && !isFilmType(""));
  assert.ok(isFilmFormat("120") && !isFilmFormat("Super 8"));
  assert.equal(filmTypeLabel(null), null);
});

// ---- system tags -----------------------------------------------------------
test("system tags: 35mm color negative (the spec's Portra example)", () => {
  assert.deepEqual(
    computeSystemTags({ filmStockName: "Portra 400", format: "35mm", filmType: "color_negative", cameraName: "Canon A-1", lensName: null, locationName: "Austin" }),
    ["35mm", "Portra 400", "Color Negative", "Canon A-1", "Austin"],
  );
});
test("system tags: B&W, slide, 120 and large format", () => {
  const t = (name: string, format: string, filmType: string) => computeSystemTags({ filmStockName: name, format, filmType, cameraName: "Canon A-1", lensName: null, locationName: "Austin" });
  assert.deepEqual(t("Tri-X 400", "35mm", "bw_negative"), ["35mm", "Tri-X 400", "Black & White Negative", "Canon A-1", "Austin"]);
  assert.deepEqual(t("Ektachrome E100", "35mm", "color_slide"), ["35mm", "Ektachrome E100", "Color Slide", "Canon A-1", "Austin"]);
  assert.deepEqual(t("Portra 160", "120", "color_negative").slice(0, 3), ["120", "Portra 160", "Color Negative"]);
  assert.equal(t("HP5", "large_format", "bw_negative")[0], "Large Format"); // label, not the stored key
});
test("system tags: format tag derives from the field; unclassified/unspecified add nothing", () => {
  assert.deepEqual(computeSystemTags({ filmStockName: "Old", format: null, filmType: null, cameraName: null, lensName: null }), ["Old"]);
  assert.deepEqual(computeSystemTags({ filmStockName: "X", format: "half_frame", cameraName: null, lensName: null }), ["Half Frame", "X"]); // filmType omitted by older callers
});
test("Drive description: classification included, de-duplicated against user tags", () => {
  const sys = computeSystemTags({ filmStockName: "Portra 400", format: "35mm", filmType: "color_negative", cameraName: null, lensName: null, locationName: "Austin" });
  assert.equal(combineTagsForDrive(sys, ["Coffee", "color negative"]).join(", "), "35mm, Portra 400, Color Negative, Austin, Coffee");
});

// ---- Explore ---------------------------------------------------------------
test("explore: ft param parsed; junk ignored", () => {
  assert.equal(parseExploreFilters({ ft: "color_slide" }).filmType, "color_slide");
  assert.equal(parseExploreFilters({ ft: "nope" }).filmType, null);
});
test("explore: filtering by each type returns exactly that type's frames", async () => {
  const ids = async (ft: string) => (await searchFrames(db(), parseExploreFilters({ ft }))).frames.map((f) => f.id).sort();
  assert.deepEqual(await ids("color_negative"), ["f-r1", "f-r4"]); // 35mm AND 120 stocks
  assert.deepEqual(await ids("bw_negative"), ["f-r2"]);
  assert.deepEqual(await ids("color_slide"), ["f-r3"]);
  assert.deepEqual(await ids("instant"), []); // no stock of the type -> empty, not "everything"
  const nav = (await searchFrameIds(db(), parseExploreFilters({ ft: "bw_negative" }))).map((f) => f.id);
  assert.deepEqual(nav, ["f-r2"]); // Previous/Next set agrees with the grid
});
test("explore: combines with other filters; unclassified stocks never match a type", async () => {
  const both = await searchFrames(db(), parseExploreFilters({ ft: "color_negative", fs: "portra120" }));
  assert.deepEqual(both.frames.map((f) => f.id), ["f-r4"]);
  const none = await searchFrames(db(), parseExploreFilters({ ft: "color_negative", fs: "trix" }));
  assert.equal(none.totalCount, 0);
  const all = await searchFrames(db(), parseExploreFilters({}));
  assert.equal(all.totalCount, 5); // no filter: unclassified frames still shown
});

// ---- AI export -------------------------------------------------------------
test("export: film_type and film_format on every row, in CSV, JSON and AI text", async () => {
  const rows = await gatherExportRows(db());
  const by = (title: string) => rows.find((r) => r.filmStock === title)!;
  assert.equal(by("Portra 400").filmType, "Color Negative");
  assert.equal(by("Portra 400").filmFormat, "35mm");
  assert.equal(by("Tri-X 400").filmType, "Black & White Negative");
  assert.equal(by("Ektachrome E100").filmType, "Color Slide");
  assert.equal(by("Portra 160").filmFormat, "120");
  assert.equal(by("Old Mystery").filmType, null);

  const csv = toCsv(rows).split("\n");
  const header = csv[0].split(",");
  assert.ok(header.indexOf("film_type") === header.indexOf("film_stock") + 1);
  assert.ok(header.includes("film_format"));
  const portraLine = csv.find((l) => l.includes("Portra 400"))!;
  assert.ok(portraLine.includes(",Portra 400,Color Negative,35mm,400,"));

  const json = JSON.parse(toJson(rows));
  assert.equal(json.find((r: { filmStock: string }) => r.filmStock === "Tri-X 400").filmType, "Black & White Negative");

  const text = toAiAnalysisText(rows);
  assert.ok(text.includes("Portra 400 (ISO 400, Color Negative, 35mm)"));
  assert.ok(text.includes("Old Mystery (unclassified)"));
  assert.ok(text.includes("film type is the film stock's classification"));
});

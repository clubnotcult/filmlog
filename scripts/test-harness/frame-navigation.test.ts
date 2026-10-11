// Run: npx tsx --test scripts/test-harness/frame-navigation.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./fake-supabase";
import { parseFrameNavContext, resolveFrameNav, contextToQueryString } from "../../src/lib/frame-nav";
import { searchFrames } from "../../src/lib/explore/search";
import { parseExploreFilters } from "../../src/lib/explore/search";
import { passesSelectionFilter, selectionsMatchedBy } from "../../src/lib/selection";

type F = { id: string; roll_id: string; frame_number: number; created_at: string; selection: string | null; drive_file_id: string | null };
// Roll A: frames 1,2,3,4,6,7 (5 missing) with deliberately non-consecutive, non-sorted ids.
// Roll B (newer): 1,2,3. Explore orders newest first, so B's frames then A's.
let t = 0;
const mk = (id: string, roll: string, n: number, sel: string | null = null, drive: string | null = "d"): F => ({
  id, roll_id: roll, frame_number: n, selection: sel, drive_file_id: drive, created_at: `2026-10-${String(roll === "B" ? 20 : 10).padStart(2, "0")}T00:00:${String(++t % 60).padStart(2, "0")}Z`,
});
const frames: F[] = [
  mk("zz9", "A", 1), mk("c3", "A", 2, "heart"), mk("a1", "A", 3, "star"), mk("q7", "A", 4), mk("b2", "A", 6, "heart"), mk("m5", "A", 7),
  mk("y1", "B", 1), mk("x2", "B", 2, "star"), mk("w3", "B", 3),
];
const db = () => fakeSupabase({ frames, rolls: [{ id: "A", film_stock_id: "s", camera_id: "c", start_date: "2026-09-01" }, { id: "B", film_stock_id: "s", camera_id: "c", start_date: "2026-09-02" }], lenses: [], frame_tags: [], film_stocks: [] });

async function walk(startId: string, ctx: ReturnType<typeof parseFrameNavContext>, dir: "next" | "prev") {
  const out: { id: string; roll: string }[] = [];
  let id: string | null = startId;
  let roll = frames.find((f) => f.id === startId)!.roll_id;
  for (let i = 0; i < 40 && id; i++) {
    out.push({ id, roll });
    const nav = await resolveFrameNav(db(), ctx, id);
    id = dir === "next" ? nav.nextFrameId : nav.prevFrameId;
    roll = (dir === "next" ? nav.nextRollId : nav.prevRollId) as string;
    // The link target must be a real frame of exactly that roll — the old bug built /rolls/<current roll>/frames/<other roll's id>.
    if (id) assert.ok(frames.some((f) => f.id === id && f.roll_id === roll), `${id} is not a frame of roll ${roll}`);
  }
  return out;
}

test("roll review: first to last in frame order, ids need not be consecutive, gaps in numbers are fine", async () => {
  const ctx = parseFrameNavContext("A", {});
  const fwd = await walk("zz9", ctx, "next");
  assert.deepEqual(fwd.map((r) => r.id), ["zz9", "c3", "a1", "q7", "b2", "m5"]); // numbers 1,2,3,4,6,7
  const back = await walk("m5", ctx, "prev");
  assert.deepEqual(back.map((r) => r.id), ["m5", "b2", "q7", "a1", "c3", "zz9"]);
  assert.ok(fwd.every((r) => r.roll === "A"));
});

test("roll review: first/last frames have no neighbor in that direction", async () => {
  const ctx = parseFrameNavContext("A", {});
  assert.equal((await resolveFrameNav(db(), ctx, "zz9")).prevFrameId, null);
  const last = await resolveFrameNav(db(), ctx, "m5");
  assert.equal(last.nextFrameId, null);
  assert.equal(last.nextRollId, null);
});

test("EXPLORE (the reported bug): Next/Prev cross rolls and every link names the neighbor's OWN roll", async () => {
  const ctx = parseFrameNavContext("B", { ctx: "explore" });
  const top = (await searchFrames(db(), parseExploreFilters({}))).frames[0].id; // Explore's first photo
  const fwd = await walk(top, ctx, "next");
  // Newest first: B's frames, then A's — including the roll boundary that used to 404.
  assert.ok(fwd.some((r) => r.roll === "B") && fwd.some((r) => r.roll === "A"), "walk must cross the roll boundary");
  assert.equal(fwd.length, frames.length);
  const boundary = fwd.findIndex((r, i) => i > 0 && r.roll !== fwd[i - 1].roll);
  assert.ok(boundary > 0);
});

test("Explore context survives navigation: filters ride along in the query string", async () => {
  const ctx = parseFrameNavContext("A", { ctx: "explore", sel: "star" });
  const qs = contextToQueryString(ctx);
  assert.match(qs, /ctx=explore/);
  assert.match(qs, /sel=star/);
  const stars = await walk("x2", ctx, "next");
  assert.deepEqual(stars.map((r) => r.id).sort(), ["a1", "x2"].sort()); // both rolls' stars, nothing else
});

test("hearts include stars; stars do not include hearts", async () => {
  assert.deepEqual(selectionsMatchedBy(["heart"]), ["heart", "star"]);
  assert.deepEqual(selectionsMatchedBy(["star"]), ["star"]);
  assert.ok(passesSelectionFilter("star", ["heart"]) && passesSelectionFilter("heart", ["heart"]));
  assert.ok(!passesSelectionFilter("heart", ["star"]) && !passesSelectionFilter(null, ["heart"]));
  assert.ok(passesSelectionFilter(null, []));
  const ids = async (sel: string) => (await searchFrames(db(), parseExploreFilters({ sel }))).frames.map((f) => f.id).sort();
  assert.deepEqual(await ids("heart"), ["a1", "b2", "c3", "x2"]); // hearts AND stars
  assert.deepEqual(await ids("star"), ["a1", "x2"]); // stars only
  assert.deepEqual(await ids("heart,star"), ["a1", "b2", "c3", "x2"]);
});

test("roll review with the Hearts filter walks hearts and stars, in frame order", async () => {
  const ctx = parseFrameNavContext("A", { sel: "heart" });
  assert.deepEqual((await walk("c3", ctx, "next")).map((r) => r.id), ["c3", "a1", "b2"]);
  const stars = parseFrameNavContext("A", { sel: "star" });
  assert.deepEqual((await walk("a1", stars, "next")).map((r) => r.id), ["a1"]);
});

test("marking a frame never loses the position: a frame that drops out of the filtered set still has neighbors", async () => {
  // Reviewing the Stars view, the current frame (c3, a heart) isn't in the set, yet Next/Prev land on its place.
  const ctx = parseFrameNavContext("A", { sel: "star" });
  const nav = await resolveFrameNav(db(), ctx, "c3");
  assert.equal(nav.nextFrameId, "a1");
  assert.equal(nav.prevFrameId, null);
});

test("unknown current frame yields no neighbors rather than throwing", async () => {
  const nav = await resolveFrameNav(db(), parseFrameNavContext("A", {}), "nope");
  assert.equal(nav.nextFrameId, null);
  assert.equal(nav.prevFrameId, null);
});

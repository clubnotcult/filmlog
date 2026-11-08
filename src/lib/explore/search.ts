import type { SupabaseClient } from "@supabase/supabase-js";
import { SELECTIONS } from "@/lib/database.types";
import { selectionsMatchedBy } from "@/lib/selection";
import { isFilmType, type FilmType } from "@/lib/film-classification";
import type { Database, ExposureEvaluation, Frame, MeterType, Selection } from "@/lib/database.types";

export const EXPLORE_PAGE_SIZE = 30;

/**
 * The one ordering Explore uses, shared by the grid query and the
 * Previous/Next query so the two can never disagree about what comes next.
 * created_at alone isn't enough: a roll import creates every frame in one
 * transaction, so they all carry the identical timestamp and would sort in
 * arbitrary (and not necessarily repeatable) order — roll_id then
 * frame_number makes it total.
 */
type Orderable<T> = { order: (column: string, opts: { ascending: boolean }) => T };
function applyExploreOrder<T extends Orderable<T>>(query: T): T {
  return query
    .order("created_at", { ascending: false })
    .order("roll_id", { ascending: true })
    .order("frame_number", { ascending: true });
}

/** A frame's place in Explore's ordering, for placing a frame that has dropped out of the filtered set. */
export type FrameOrderKey = { id: string; created_at: string; roll_id: string; frame_number: number };

/** Negative if a sorts before b in Explore's ordering. Mirrors applyExploreOrder exactly. */
export function compareExploreOrder(a: FrameOrderKey, b: FrameOrderKey): number {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
  if (a.roll_id !== b.roll_id) return a.roll_id < b.roll_id ? -1 : 1;
  return a.frame_number - b.frame_number;
}

export type ExploreFilters = {
  filmStockId: string | null;
  /** Film classification (color negative, B&W negative...): matches every stock of that type. */
  filmType: FilmType | null;
  cameraId: string | null;
  lensId: string | null;
  focalLength: string | null;
  apertures: number[];
  shutterSpeeds: string[];
  meterType: MeterType | null;
  exposureEvaluation: ExposureEvaluation | null;
  /** Which marks to show. Empty = all frames; ["heart"], ["star"], or both. Independent toggles, not a threshold. */
  selections: Selection[];
  tagId: string | null;
  locationId: string | null;
  year: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  page: number;
};

function parseCsvNumbers(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));
}

function parseCsvStrings(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").filter((v) => v.length > 0);
}

/**
 * `sel=heart,star` is the current form. `fav=1` is what links and bookmarks
 * made before selection existed used to mean ("any favorite"), so it's still
 * honoured — as both marks, since an old favorite is a heart today and a
 * person asking for "my favorites" would also want anything promoted past it.
 */
function parseSelections(searchParams: Record<string, string | undefined>): Selection[] {
  const fromSel = parseCsvStrings(searchParams.sel).filter((v): v is Selection =>
    (SELECTIONS as string[]).includes(v),
  );
  if (fromSel.length > 0) return fromSel;
  return searchParams.fav === "1" ? [...SELECTIONS] : [];
}

/** Reads Explore's filter state from the page's URL search params. */
export function parseExploreFilters(
  searchParams: Record<string, string | undefined>,
): ExploreFilters {
  const page = Number(searchParams.page);
  return {
    filmStockId: searchParams.fs || null,
    filmType: isFilmType(searchParams.ft) ? searchParams.ft : null,
    cameraId: searchParams.cam || null,
    lensId: searchParams.lens || null,
    focalLength: searchParams.focal || null,
    apertures: parseCsvNumbers(searchParams.ap),
    shutterSpeeds: parseCsvStrings(searchParams.sh),
    meterType: (searchParams.meter as MeterType | undefined) || null,
    exposureEvaluation: (searchParams.eval as ExposureEvaluation | undefined) || null,
    selections: parseSelections(searchParams),
    tagId: searchParams.tag || null,
    locationId: searchParams.loc || null,
    year: searchParams.year ? Number(searchParams.year) || null : null,
    dateFrom: searchParams.from || null,
    dateTo: searchParams.to || null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function hasAnyFilter(filters: ExploreFilters): boolean {
  return Boolean(
    filters.filmStockId ||
      filters.filmType ||
      filters.cameraId ||
      filters.lensId ||
      filters.focalLength ||
      filters.apertures.length > 0 ||
      filters.shutterSpeeds.length > 0 ||
      filters.meterType ||
      filters.exposureEvaluation ||
      filters.selections.length > 0 ||
      filters.tagId ||
      filters.locationId ||
      filters.year ||
      filters.dateFrom ||
      filters.dateTo,
  );
}


/**
 * Film stocks of a classification, as ids — null when no type filter is set,
 * so callers can tell "no filter" from "filter matched nothing". Resolved
 * through film_stocks, the single place classification lives, so a stock's
 * type applies to every roll and frame that uses it with no per-frame data.
 */
export async function resolveFilmTypeStockIds(
  supabase: SupabaseClient<Database>,
  filmType: FilmType | null,
): Promise<string[] | null> {
  if (!filmType) return null;
  const { data } = await supabase.from("film_stocks").select("id").eq("film_type", filmType);
  return (data ?? []).map((s) => s.id);
}


/** Intersects two optional id sets; null means "no constraint". */
function intersect(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null) return b;
  if (b === null) return a;
  const set = new Set(b);
  return a.filter((id) => set.has(id));
}

/**
 * Frames whose EFFECTIVE value of a roll-inheritable column is one of
 * `values`: either set on the frame itself, or left empty on the frame and
 * provided by its roll's default. A frame with its own different value never
 * matches through its roll — the explicit value wins, exactly as displayed.
 */
async function framesWithEffective(
  supabase: SupabaseClient<Database>,
  frameColumn: "lens_id" | "location_id",
  rollColumn: "default_lens_id" | "location_id",
  values: string[],
): Promise<string[]> {
  if (values.length === 0) return [];
  const [{ data: direct }, { data: rolls }] = await Promise.all([
    supabase.from("frames").select("id").in(frameColumn, values),
    supabase.from("rolls").select("id").in(rollColumn, values),
  ]);
  const rollIds = (rolls ?? []).map((r) => r.id);
  const { data: inherited } =
    rollIds.length > 0
      ? await supabase.from("frames").select("id").in("roll_id", rollIds).is(frameColumn, null)
      : { data: [] as { id: string }[] };
  return [...new Set([...(direct ?? []), ...(inherited ?? [])].map((f) => f.id))];
}

/**
 * Resolves every filter that can't be a plain column condition on frames —
 * roll-level fields, and the inheritable lens / focal length / location /
 * tag filters — to roll-id and frame-id constraints. "empty" = the filters
 * can't match anything, so callers return no results without querying.
 */
async function resolvePreFilters(
  supabase: SupabaseClient<Database>,
  filters: ExploreFilters,
): Promise<{ rollIds: string[] | null; frameIds: string[] | null } | "empty"> {
  const typeStockIds = await resolveFilmTypeStockIds(supabase, filters.filmType);
  if (typeStockIds !== null && typeStockIds.length === 0) return "empty";

  let rollIds: string[] | null = null;
  if (filters.filmStockId || filters.filmType || filters.cameraId || filters.year || filters.dateFrom || filters.dateTo) {
    let rollsQuery = supabase.from("rolls").select("id");
    if (filters.filmStockId) rollsQuery = rollsQuery.eq("film_stock_id", filters.filmStockId);
    if (typeStockIds !== null) rollsQuery = rollsQuery.in("film_stock_id", typeStockIds);
    if (filters.cameraId) rollsQuery = rollsQuery.eq("camera_id", filters.cameraId);
    if (filters.year) {
      rollsQuery = rollsQuery
        .gte("start_date", `${filters.year}-01-01`)
        .lte("start_date", `${filters.year}-12-31`);
    }
    if (filters.dateFrom) rollsQuery = rollsQuery.gte("start_date", filters.dateFrom);
    if (filters.dateTo) rollsQuery = rollsQuery.lte("start_date", filters.dateTo);
    const { data } = await rollsQuery;
    rollIds = (data ?? []).map((r) => r.id);
    if (rollIds.length === 0) return "empty";
  }

  let frameIds: string[] | null = null;

  if (filters.lensId) {
    frameIds = intersect(frameIds, await framesWithEffective(supabase, "lens_id", "default_lens_id", [filters.lensId]));
    if (frameIds!.length === 0) return "empty";
  }

  if (filters.focalLength) {
    const { data } = await supabase.from("lenses").select("id").eq("focal_length", filters.focalLength);
    const lensIds = (data ?? []).map((l) => l.id);
    if (lensIds.length === 0) return "empty";
    frameIds = intersect(frameIds, await framesWithEffective(supabase, "lens_id", "default_lens_id", lensIds));
    if (frameIds!.length === 0) return "empty";
  }

  if (filters.locationId) {
    frameIds = intersect(frameIds, await framesWithEffective(supabase, "location_id", "location_id", [filters.locationId]));
    if (frameIds!.length === 0) return "empty";
  }

  if (filters.tagId) {
    // A frame carries a tag if it was tagged directly OR its roll carries it
    // as a global tag (roll_tags are inherited, never copied).
    const [{ data: direct }, { data: rollTagRows }] = await Promise.all([
      supabase.from("frame_tags").select("frame_id").eq("tag_id", filters.tagId),
      supabase.from("roll_tags").select("roll_id").eq("tag_id", filters.tagId),
    ]);
    const taggedRollIds = (rollTagRows ?? []).map((r) => r.roll_id);
    const { data: inherited } =
      taggedRollIds.length > 0
        ? await supabase.from("frames").select("id").in("roll_id", taggedRollIds)
        : { data: [] as { id: string }[] };
    const tagged = [...new Set([...(direct ?? []).map((r) => r.frame_id), ...(inherited ?? []).map((f) => f.id)])];
    frameIds = intersect(frameIds, tagged);
    if (frameIds!.length === 0) return "empty";
  }

  return { rollIds, frameIds };
}

export type ExploreSearchResult = {
  frames: Frame[];
  totalCount: number;
};

/**
 * The ordered frames matching a filter set (id plus ordering key), no pagination —
 * used for Previous/Next navigation from Explore, which needs to know a
 * frame's neighbors across the WHOLE filtered set, not just the page it was
 * opened from. Selects only `id`, so even an unfiltered browse of a large
 * archive stays cheap — no thumbnail URLs, no joined metadata, just the
 * ordering. Capped at 2000, comfortably past any personal archive's likely
 * size, so this can't silently balloon into an unbounded query.
 */
export async function searchFrameIds(
  supabase: SupabaseClient<Database>,
  filters: ExploreFilters,
): Promise<FrameOrderKey[]> {
  const pre = await resolvePreFilters(supabase, filters);
  if (pre === "empty") return [];

  let framesQuery = supabase
    .from("frames")
    .select("id, created_at, roll_id, frame_number")
    .not("drive_file_id", "is", null);

  if (pre.rollIds !== null) framesQuery = framesQuery.in("roll_id", pre.rollIds);
  if (pre.frameIds !== null) framesQuery = framesQuery.in("id", pre.frameIds);
  if (filters.apertures.length > 0) framesQuery = framesQuery.in("aperture", filters.apertures);
  if (filters.shutterSpeeds.length > 0) framesQuery = framesQuery.in("shutter_speed", filters.shutterSpeeds);
  if (filters.meterType) framesQuery = framesQuery.eq("meter_type", filters.meterType);
  if (filters.exposureEvaluation) {
    framesQuery = framesQuery.eq("exposure_evaluation", filters.exposureEvaluation);
  }
  if (filters.selections.length > 0) framesQuery = framesQuery.in("selection", selectionsMatchedBy(filters.selections));

  const { data } = await applyExploreOrder(framesQuery).limit(2000);
  return data ?? [];
}

/**
 * Resolves the combinable filters to a paginated set of synced frames.
 *
 * Deliberately built from a sequence of ordinary, individually simple
 * queries (.eq/.in/.gte/.lte on one table at a time) rather than a single
 * query with nested-embedded-resource filtering. Both approaches are valid
 * Supabase patterns, but this one only relies on query shapes that are
 * trivial to reason about and don't depend on subtler PostgREST embedding
 * behavior — worth the extra round trips given this couldn't be tested
 * against a live Supabase project from the sandbox this was built in.
 *
 * Every result is guaranteed to have a synced image (drive_file_id is not
 * null) — Explore is a way to see photographs, so a frame with no attached
 * image has nothing to show here regardless of its metadata.
 */
export async function searchFrames(
  supabase: SupabaseClient<Database>,
  filters: ExploreFilters,
): Promise<ExploreSearchResult> {
  // Step 1: roll-level filters and the inheritable lens / focal length /
  // location / tag filters, resolved to id constraints (see resolvePreFilters).
  const pre = await resolvePreFilters(supabase, filters);
  if (pre === "empty") return { frames: [], totalCount: 0 };

  // Step 3: the frames query itself — every condition here is a direct
  // column on frames, so this is the only query that needs to run against
  // potentially thousands of rows, and it's fully indexed (see the Phase 6C
  // migration and the existing per-column indexes from earlier phases).
  let framesQuery = supabase
    .from("frames")
    .select("*", { count: "exact" })
    .not("drive_file_id", "is", null);

  if (pre.rollIds !== null) framesQuery = framesQuery.in("roll_id", pre.rollIds);
  if (pre.frameIds !== null) framesQuery = framesQuery.in("id", pre.frameIds);
  if (filters.apertures.length > 0) framesQuery = framesQuery.in("aperture", filters.apertures);
  if (filters.shutterSpeeds.length > 0) {
    framesQuery = framesQuery.in("shutter_speed", filters.shutterSpeeds);
  }
  if (filters.meterType) framesQuery = framesQuery.eq("meter_type", filters.meterType);
  if (filters.exposureEvaluation) {
    framesQuery = framesQuery.eq("exposure_evaluation", filters.exposureEvaluation);
  }
  if (filters.selections.length > 0) framesQuery = framesQuery.in("selection", selectionsMatchedBy(filters.selections));

  const from = (filters.page - 1) * EXPLORE_PAGE_SIZE;
  const to = from + EXPLORE_PAGE_SIZE - 1;

  const { data, count } = await applyExploreOrder(framesQuery).range(from, to);

  return { frames: data ?? [], totalCount: count ?? 0 };
}

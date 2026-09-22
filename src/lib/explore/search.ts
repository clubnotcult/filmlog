import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Frame } from "@/lib/database.types";

export const EXPLORE_PAGE_SIZE = 30;

export type ExploreFilters = {
  filmStockId: string | null;
  cameraId: string | null;
  lensId: string | null;
  focalLength: string | null;
  apertures: number[];
  shutterSpeeds: string[];
  pushPulls: number[];
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

/** Reads Explore's filter state from the page's URL search params. */
export function parseExploreFilters(
  searchParams: Record<string, string | undefined>,
): ExploreFilters {
  const page = Number(searchParams.page);
  return {
    filmStockId: searchParams.fs || null,
    cameraId: searchParams.cam || null,
    lensId: searchParams.lens || null,
    focalLength: searchParams.focal || null,
    apertures: parseCsvNumbers(searchParams.ap),
    shutterSpeeds: parseCsvStrings(searchParams.sh),
    pushPulls: parseCsvNumbers(searchParams.push),
    year: searchParams.year ? Number(searchParams.year) || null : null,
    dateFrom: searchParams.from || null,
    dateTo: searchParams.to || null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function hasAnyFilter(filters: ExploreFilters): boolean {
  return Boolean(
    filters.filmStockId ||
      filters.cameraId ||
      filters.lensId ||
      filters.focalLength ||
      filters.apertures.length > 0 ||
      filters.shutterSpeeds.length > 0 ||
      filters.pushPulls.length > 0 ||
      filters.year ||
      filters.dateFrom ||
      filters.dateTo,
  );
}

export type ExploreSearchResult = {
  frames: Frame[];
  totalCount: number;
};

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
  // Step 1: resolve roll-level filters (film stock, camera, year, date
  // range) to a set of matching roll ids, only if at least one is active.
  let rollIds: string[] | null = null;
  if (filters.filmStockId || filters.cameraId || filters.year || filters.dateFrom || filters.dateTo) {
    let rollsQuery = supabase.from("rolls").select("id");
    if (filters.filmStockId) rollsQuery = rollsQuery.eq("film_stock_id", filters.filmStockId);
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
    if (rollIds.length === 0) {
      return { frames: [], totalCount: 0 };
    }
  }

  // Step 2: resolve the focal-length filter to a set of matching lens ids
  // (a lens property, not a frame column). The direct lens filter doesn't
  // need this — it already targets frames.lens_id.
  let focalLengthLensIds: string[] | null = null;
  if (filters.focalLength) {
    const { data } = await supabase
      .from("lenses")
      .select("id")
      .eq("focal_length", filters.focalLength);
    focalLengthLensIds = (data ?? []).map((l) => l.id);
    if (focalLengthLensIds.length === 0) {
      return { frames: [], totalCount: 0 };
    }
  }

  // Step 3: the frames query itself — every condition here is a direct
  // column on frames, so this is the only query that needs to run against
  // potentially thousands of rows, and it's fully indexed (see the Phase 6C
  // migration and the existing per-column indexes from earlier phases).
  let framesQuery = supabase
    .from("frames")
    .select("*", { count: "exact" })
    .not("drive_file_id", "is", null);

  if (rollIds !== null) framesQuery = framesQuery.in("roll_id", rollIds);
  if (filters.lensId) framesQuery = framesQuery.eq("lens_id", filters.lensId);
  if (focalLengthLensIds !== null) framesQuery = framesQuery.in("lens_id", focalLengthLensIds);
  if (filters.apertures.length > 0) framesQuery = framesQuery.in("aperture", filters.apertures);
  if (filters.shutterSpeeds.length > 0) {
    framesQuery = framesQuery.in("shutter_speed", filters.shutterSpeeds);
  }
  if (filters.pushPulls.length > 0) framesQuery = framesQuery.in("push_pull", filters.pushPulls);

  const from = (filters.page - 1) * EXPLORE_PAGE_SIZE;
  const to = from + EXPLORE_PAGE_SIZE - 1;

  const { data, count } = await framesQuery
    .order("created_at", { ascending: false })
    .range(from, to);

  return { frames: data ?? [], totalCount: count ?? 0 };
}

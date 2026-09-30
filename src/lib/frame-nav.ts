import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { parseExploreFilters, searchFrameIds, type ExploreFilters } from "@/lib/explore/search";

export type FrameNavContext =
  | { kind: "roll"; rollId: string }
  | { kind: "explore"; filters: ExploreFilters };

/** Reads which context opened this frame from its URL search params — the same params Explore itself uses, plus `ctx`. */
export function parseFrameNavContext(
  rollId: string,
  searchParams: Record<string, string | undefined>,
): FrameNavContext {
  if (searchParams.ctx === "explore") {
    return { kind: "explore", filters: parseExploreFilters(searchParams) };
  }
  return { kind: "roll", rollId };
}

/** Explore's own filter params as a query string, no `ctx` — for linking back to /explore itself. */
function exploreFilterParams(f: ExploreFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.filmStockId) params.set("fs", f.filmStockId);
  if (f.cameraId) params.set("cam", f.cameraId);
  if (f.lensId) params.set("lens", f.lensId);
  if (f.focalLength) params.set("focal", f.focalLength);
  if (f.apertures.length > 0) params.set("ap", f.apertures.join(","));
  if (f.shutterSpeeds.length > 0) params.set("sh", f.shutterSpeeds.join(","));
  if (f.meterType) params.set("meter", f.meterType);
  if (f.exposureEvaluation) params.set("eval", f.exposureEvaluation);
  if (f.favoritesOnly) params.set("fav", "1");
  if (f.tagId) params.set("tag", f.tagId);
  if (f.locationId) params.set("loc", f.locationId);
  if (f.year) params.set("year", String(f.year));
  if (f.dateFrom) params.set("from", f.dateFrom);
  if (f.dateTo) params.set("to", f.dateTo);
  return params;
}

/** Turns a context back into the query string to carry along on Previous/Next links, so navigating doesn't lose it. */
export function contextToQueryString(context: FrameNavContext): string {
  if (context.kind === "roll") return "";
  const params = exploreFilterParams(context.filters);
  params.set("ctx", "explore");
  return `?${params.toString()}`;
}

export type FrameNavResult = {
  prevFrameId: string | null;
  nextFrameId: string | null;
  /** Where "back" should go — the roll, or back to Explore with its filters intact. */
  backHref: string;
  backLabel: string;
};

export async function resolveFrameNav(
  supabase: SupabaseClient<Database>,
  context: FrameNavContext,
  currentFrameId: string,
): Promise<FrameNavResult> {
  let orderedIds: string[];
  let backHref: string;
  let backLabel: string;

  if (context.kind === "roll") {
    const { data } = await supabase
      .from("frames")
      .select("id")
      .eq("roll_id", context.rollId)
      .order("frame_number", { ascending: true });
    orderedIds = (data ?? []).map((f) => f.id);
    backHref = `/rolls/${context.rollId}`;
    backLabel = "Roll";
  } else {
    orderedIds = await searchFrameIds(supabase, context.filters);
    const params = exploreFilterParams(context.filters);
    const qs = params.toString();
    backHref = qs ? `/explore?${qs}` : "/explore";
    backLabel = "Explore";
  }

  const index = orderedIds.indexOf(currentFrameId);
  return {
    prevFrameId: index > 0 ? orderedIds[index - 1] : null,
    nextFrameId: index >= 0 && index < orderedIds.length - 1 ? orderedIds[index + 1] : null,
    backHref,
    backLabel,
  };
}

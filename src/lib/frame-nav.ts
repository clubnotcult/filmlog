import type { SupabaseClient } from "@supabase/supabase-js";
import { SELECTIONS } from "@/lib/database.types";
import type { Database, Selection } from "@/lib/database.types";
import {
  compareExploreOrder,
  parseExploreFilters,
  searchFrameIds,
  type ExploreFilters,
  type FrameOrderKey,
} from "@/lib/explore/search";

export type FrameNavContext =
  | { kind: "roll"; rollId: string; selections: Selection[] }
  | { kind: "explore"; filters: ExploreFilters };

function parseSelectionParam(value: string | undefined): Selection[] {
  return (value ?? "")
    .split(",")
    .filter((v): v is Selection => (SELECTIONS as string[]).includes(v));
}

/** Reads which context opened this frame from its URL search params — the same params Explore itself uses, plus `ctx`. */
export function parseFrameNavContext(
  rollId: string,
  searchParams: Record<string, string | undefined>,
): FrameNavContext {
  if (searchParams.ctx === "explore") {
    return { kind: "explore", filters: parseExploreFilters(searchParams) };
  }
  // A roll opened with a ♥/★ filter on carries it, so Previous/Next walks
  // just the marked frames of that roll rather than the whole roll.
  return { kind: "roll", rollId, selections: parseSelectionParam(searchParams.sel) };
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
  if (f.selections.length > 0) params.set("sel", f.selections.join(","));
  if (f.tagId) params.set("tag", f.tagId);
  if (f.locationId) params.set("loc", f.locationId);
  if (f.year) params.set("year", String(f.year));
  if (f.dateFrom) params.set("from", f.dateFrom);
  if (f.dateTo) params.set("to", f.dateTo);
  return params;
}

/** Turns a context back into the query string to carry along on Previous/Next links, so navigating doesn't lose it. */
export function contextToQueryString(context: FrameNavContext): string {
  if (context.kind === "roll") {
    return context.selections.length > 0 ? `?sel=${context.selections.join(",")}` : "";
  }
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

/** Neighbors of `current` within `ordered`; if `current` has dropped out of the set, its neighbors by position instead. */
export function neighborsByPosition<T extends { id: string }>(
  ordered: T[],
  current: T,
  isBefore: (a: T, b: T) => boolean,
): { prev: T | null; next: T | null } {
  const index = ordered.findIndex((r) => r.id === current.id);
  if (index >= 0) {
    return { prev: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null };
  }
  // Not in the set (e.g. it was just demoted while browsing a ♥-only view).
  // Navigation must not vanish mid-review, so place it where it belongs.
  let insertAt = ordered.findIndex((r) => !isBefore(r, current));
  if (insertAt === -1) insertAt = ordered.length;
  return { prev: ordered[insertAt - 1] ?? null, next: ordered[insertAt] ?? null };
}

export async function resolveFrameNav(
  supabase: SupabaseClient<Database>,
  context: FrameNavContext,
  currentFrameId: string,
): Promise<FrameNavResult> {
  if (context.kind === "roll") {
    // A roll is small (tens of frames), so fetch it whole and filter here —
    // that keeps "the current frame is always part of its own context" a
    // one-line rule instead of a query-shaped special case.
    const { data } = await supabase
      .from("frames")
      .select("id, frame_number, selection")
      .eq("roll_id", context.rollId)
      .order("frame_number", { ascending: true });
    const all = data ?? [];
    const current = all.find((f) => f.id === currentFrameId);
    const inContext = all.filter(
      (f) =>
        f.id === currentFrameId ||
        context.selections.length === 0 ||
        (f.selection !== null && context.selections.includes(f.selection)),
    );
    const { prev, next } = current
      ? neighborsByPosition(inContext, current, (a, b) => a.frame_number < b.frame_number)
      : { prev: null, next: null };
    return {
      prevFrameId: prev?.id ?? null,
      nextFrameId: next?.id ?? null,
      backHref: `/rolls/${context.rollId}`,
      backLabel: "Roll",
    };
  }

  const ordered: FrameOrderKey[] = await searchFrameIds(supabase, context.filters);
  let current: FrameOrderKey | undefined = ordered.find((r) => r.id === currentFrameId);
  if (!current) {
    const { data } = await supabase
      .from("frames")
      .select("id, created_at, roll_id, frame_number")
      .eq("id", currentFrameId)
      .single();
    current = data ?? undefined;
  }
  const { prev, next } = current
    ? neighborsByPosition(ordered, current, (a, b) => compareExploreOrder(a, b) < 0)
    : { prev: null, next: null };

  const qs = exploreFilterParams(context.filters).toString();
  return {
    prevFrameId: prev?.id ?? null,
    nextFrameId: next?.id ?? null,
    backHref: qs ? `/explore?${qs}` : "/explore",
    backLabel: "Explore",
  };
}

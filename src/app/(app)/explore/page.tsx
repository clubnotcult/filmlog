import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { parseExploreFilters, hasAnyFilter, searchFrames, EXPLORE_PAGE_SIZE } from "@/lib/explore/search";
import { ExploreFilterBar } from "@/components/explore/filter-bar";
import { ExploreResultCard } from "@/components/explore/result-card";
import { LibraryTabs } from "@/components/library-tabs";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const rawParams = await searchParams;
  const filters = parseExploreFilters(rawParams);
  const supabase = await createClient();

  const [{ data: filmStocks }, { data: cameras }, { data: lenses }, { data: rollDates }] =
    await Promise.all([
      supabase.from("film_stocks").select("id, name").order("name", { ascending: true }),
      supabase.from("cameras").select("id, name").order("name", { ascending: true }),
      supabase
        .from("lenses")
        .select("id, name, focal_length, aperture_stops")
        .order("name", { ascending: true }),
      supabase.from("rolls").select("start_date"),
    ]);

  // Option lists derived from configured gear (what's plausible to filter
  // by), not scanned from the frames table (what's cheap to compute — the
  // gear tables are tiny for a single user, unlike frames at scale).
  const focalLengths = Array.from(
    new Set((lenses ?? []).map((l) => l.focal_length).filter((v): v is string => Boolean(v))),
  );
  const apertureOptions = Array.from(
    new Set((lenses ?? []).flatMap((l) => l.aperture_stops)),
  ).sort((a, b) => a - b);

  const { data: cameraRows } = await supabase.from("cameras").select("shutter_speeds");
  const shutterSpeedOptions = Array.from(
    new Set((cameraRows ?? []).flatMap((c) => c.shutter_speeds)),
  );
  const years = Array.from(
    new Set((rollDates ?? []).map((r) => new Date(r.start_date + "T00:00:00Z").getUTCFullYear())),
  ).sort((a, b) => b - a);

  // Whether there is ANY synced photo at all in the whole account — used to
  // tell "no results match your filters" apart from "nothing has been
  // synced yet," which need different empty-state messages.
  const { count: totalSyncedCount } = await supabase
    .from("frames")
    .select("id", { count: "exact", head: true })
    .not("drive_file_id", "is", null);

  const { frames, totalCount } = await searchFrames(supabase, filters);

  // Display context for the current page of results only (roll/film
  // stock/camera/lens names) — fetched for just what's on screen, not the
  // whole matching set, so a large result count stays cheap to render.
  const rollIds = Array.from(new Set(frames.map((f) => f.roll_id)));
  const lensIds = Array.from(
    new Set(frames.map((f) => f.lens_id).filter((v): v is string => Boolean(v))),
  );
  const [{ data: resultRolls }, { data: resultLenses }] = await Promise.all([
    rollIds.length > 0
      ? supabase.from("rolls").select("id, film_stock_id, camera_id").in("id", rollIds)
      : Promise.resolve({ data: [] as { id: string; film_stock_id: string; camera_id: string }[] }),
    lensIds.length > 0
      ? supabase.from("lenses").select("id, name").in("id", lensIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const filmStockNameById = new Map((filmStocks ?? []).map((f) => [f.id, f.name]));
  const cameraNameById = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const lensNameById = new Map((resultLenses ?? []).map((l) => [l.id, l.name]));
  const rollById = new Map((resultRolls ?? []).map((r) => [r.id, r]));

  const totalPages = Math.max(1, Math.ceil(totalCount / EXPLORE_PAGE_SIZE));
  const filtersActive = hasAnyFilter(filters);

  return (
    <div className="mx-auto max-w-5xl">
      <LibraryTabs active="images" />
      <p className="mt-4 text-xs text-muted">
        Browse your photographs by film stock, gear, and exposure.
      </p>

      <div className="mt-4">
        <ExploreFilterBar
          filmStocks={filmStocks ?? []}
          cameras={cameras ?? []}
          lenses={lenses ?? []}
          focalLengths={focalLengths}
          apertureOptions={apertureOptions}
          shutterSpeedOptions={shutterSpeedOptions}
          years={years}
          current={filters}
        />
      </div>

      <div className="mt-6">
        {!totalSyncedCount || totalSyncedCount === 0 ? (
          <div className="rounded-md border border-border bg-surface px-4 py-6 text-center">
            <p className="text-sm text-foreground">No synced photos yet.</p>
            <p className="mt-1 text-xs text-muted">
              Sync photos from Google Drive on a roll&apos;s detail page before
              they can appear here.
            </p>
            <Link href="/rolls" className="mt-3 inline-block text-xs text-accent hover:underline">
              Go to Rolls
            </Link>
          </div>
        ) : frames.length === 0 ? (
          <div className="rounded-md border border-border bg-surface px-4 py-6 text-center">
            <p className="text-sm text-foreground">No photos match these filters.</p>
            {filtersActive && (
              <Link href="/explore" className="mt-2 inline-block text-xs text-accent hover:underline">
                Clear all filters
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-strong">
              {totalCount} {totalCount === 1 ? "photo" : "photos"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {frames.map((frame) => {
                const roll = rollById.get(frame.roll_id);
                return (
                  <ExploreResultCard
                    key={frame.id}
                    frame={frame}
                    href={`/rolls/${frame.roll_id}/frames/${frame.id}`}
                    filmStockName={roll ? (filmStockNameById.get(roll.film_stock_id) ?? null) : null}
                    cameraName={roll ? (cameraNameById.get(roll.camera_id) ?? null) : null}
                    lensName={frame.lens_id ? (lensNameById.get(frame.lens_id) ?? null) : null}
                  />
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between text-xs">
                <PageLink params={rawParams} page={filters.page - 1} disabled={filters.page <= 1}>
                  ← Previous
                </PageLink>
                <span className="text-muted">
                  Page {filters.page} of {totalPages}
                </span>
                <PageLink
                  params={rawParams}
                  page={filters.page + 1}
                  disabled={filters.page >= totalPages}
                >
                  Next →
                </PageLink>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted opacity-40">{children}</span>;
  }
  const next = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  );
  next.set("page", String(page));
  return (
    <Link href={`/explore?${next.toString()}`} className="text-accent hover:underline">
      {children}
    </Link>
  );
}

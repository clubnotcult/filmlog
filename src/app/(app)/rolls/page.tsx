import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { generateRollTitle } from "@/lib/roll-title";
import { formatLongDate } from "@/lib/date";
import { computeSyncStatus, syncStatusLabel, syncStatusColorClass } from "@/lib/sync-status";
import { FILM_TYPES, filmTypeLabel, isFilmType } from "@/lib/film-classification";
import { LibraryTabs } from "@/components/library-tabs";

export default async function RollsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; type?: string }>;
}) {
  const { archived: archivedParam, type: typeParam } = await searchParams;
  const typeFilter = isFilmType(typeParam) ? typeParam : null;
  const showArchived = archivedParam === "1";

  const supabase = await createClient();

  const [
    { data: rolls },
    { data: filmStocks },
    { data: cameras },
    { data: lenses },
    { data: frames },
  ] = await Promise.all([
    supabase.from("rolls").select("*").order("start_date", { ascending: false }),
    supabase.from("film_stocks").select("id, name, film_type"),
    supabase.from("cameras").select("id, name"),
    supabase.from("lenses").select("id, name"),
    supabase.from("frames").select("roll_id, drive_file_id"),
  ]);

  const filmStockById = new Map((filmStocks ?? []).map((f) => [f.id, f.name]));
  const filmTypeByStock = new Map((filmStocks ?? []).map((f) => [f.id, f.film_type]));
  const cameraById = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const lensById = new Map((lenses ?? []).map((l) => [l.id, l.name]));

  const frameCountByRoll = new Map<string, number>();
  const framesByRoll = new Map<string, { drive_file_id: string | null }[]>();
  for (const frame of frames ?? []) {
    frameCountByRoll.set(
      frame.roll_id,
      (frameCountByRoll.get(frame.roll_id) ?? 0) + 1,
    );
    const list = framesByRoll.get(frame.roll_id) ?? [];
    list.push({ drive_file_id: frame.drive_file_id });
    framesByRoll.set(frame.roll_id, list);
  }

  const allRolls = rolls ?? [];
  const archivedRolls = allRolls.filter((r) => r.status === "archived");
  const shownByArchive = showArchived
    ? allRolls
    : allRolls.filter((r) => r.status !== "archived");
  // Film-type filter: a roll's type is its film stock's classification.
  const visibleRolls = typeFilter
    ? shownByArchive.filter((r) => filmTypeByStock.get(r.film_stock_id) === typeFilter)
    : shownByArchive;
  const hrefFor = (type: string | null, archived: boolean) => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (archived) p.set("archived", "1");
    const qs = p.toString();
    return qs ? `/rolls?${qs}` : "/rolls";
  };

  return (
    <div className="mx-auto max-w-3xl">
      <LibraryTabs active="rolls" />

      <div className="mt-6 flex items-center justify-between">
        <h2 className="label">
          {visibleRolls.length} {visibleRolls.length === 1 ? "ROLL" : "ROLLS"}
        </h2>
        <Link
          href="/rolls/new"
          className="numeral flex h-10 items-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
        >
          Start a roll
        </Link>
      </div>

      <div role="group" aria-label="Filter by film type" className="mt-3 flex flex-wrap gap-2">
        {[{ value: null, label: "All" }, ...FILM_TYPES].map((t) => {
          const on = t.value === typeFilter;
          return (
            <Link
              key={t.value ?? "all"}
              href={hrefFor(t.value, showArchived)}
              aria-current={on ? "true" : undefined}
              className={`numeral flex h-8 items-center border px-3 text-xs transition-colors ${
                on ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {archivedRolls.length > 0 && (
        <div className="mt-2">
          <Link
            href={hrefFor(typeFilter, !showArchived)}
            className="text-xs text-muted hover:text-foreground"
          >
            {showArchived
              ? "Hide archived rolls"
              : `Show archived rolls (${archivedRolls.length})`}
          </Link>
        </div>
      )}

      {visibleRolls.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {allRolls.length === 0 ? (
            <>
              No rolls yet.{" "}
              <Link href="/rolls/new" className="text-accent hover:underline">
                Start your first roll
              </Link>
              .
            </>
          ) : (
            "No rolls to show."
          )}
        </p>
      ) : (
        <ul className="mt-3 border-t border-border">
          {visibleRolls.map((roll) => {
            const filmStockName = filmStockById.get(roll.film_stock_id) ?? "Unknown film";
            const cameraName = cameraById.get(roll.camera_id) ?? "Unknown camera";
            const lensName = lensById.get(roll.default_lens_id) ?? "Unknown lens";
            const frameCount = frameCountByRoll.get(roll.id) ?? 0;
            const syncStatus = computeSyncStatus(framesByRoll.get(roll.id) ?? []);
            const title = generateRollTitle({
              startDate: roll.start_date,
              endDate: roll.end_date,
              filmStockName,
              customTitle: roll.custom_title,
            });

            return (
              <li key={roll.id} className={`border-b border-border ${roll.status === "archived" ? "opacity-55" : ""}`}>
                <Link
                  href={`/rolls/${roll.id}`}
                  className="grid grid-cols-[1fr_auto] gap-x-5 py-4 transition-colors hover:bg-surface/60"
                >
                  <div className="min-w-0">
                    <p className="break-words text-base leading-snug text-foreground">{title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {cameraName} · {lensName}
                      {filmTypeLabel(filmTypeByStock.get(roll.film_stock_id)) &&
                        ` · ${filmTypeLabel(filmTypeByStock.get(roll.film_stock_id))}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatLongDate(roll.start_date)}
                      {roll.end_date && ` – ${formatLongDate(roll.end_date)}`} ·{" "}
                      <span className={syncStatusColorClass(syncStatus)}>
                        {syncStatusLabel(syncStatus)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-center">
                    <span className="numeral text-3xl font-light leading-none text-foreground">
                      {frameCount}
                    </span>
                    <span
                      className={`label mt-2 ${roll.status === "active" ? "!text-accent" : ""}`}
                    >
                      {roll.status === "active"
                        ? "Active"
                        : roll.status === "archived"
                          ? "Archived"
                          : frameCount === 1
                            ? "Frame"
                            : "Frames"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { formatAperture } from "@/lib/exposure-format";
import { EXPOSURE_EVALUATIONS, METER_TYPES } from "@/lib/database.types";
import type { ExploreFilters } from "@/lib/explore/search";

type Option = { id: string; name: string };

function updateParams(current: ExploreFilters, patch: Record<string, string | null>) {
  const params = new URLSearchParams();
  if (current.filmStockId) params.set("fs", current.filmStockId);
  if (current.cameraId) params.set("cam", current.cameraId);
  if (current.lensId) params.set("lens", current.lensId);
  if (current.focalLength) params.set("focal", current.focalLength);
  if (current.apertures.length > 0) params.set("ap", current.apertures.join(","));
  if (current.shutterSpeeds.length > 0) params.set("sh", current.shutterSpeeds.join(","));
  if (current.meterType) params.set("meter", current.meterType);
  if (current.exposureEvaluation) params.set("eval", current.exposureEvaluation);
  if (current.favoritesOnly) params.set("fav", "1");
  if (current.tagId) params.set("tag", current.tagId);
  if (current.locationId) params.set("loc", current.locationId);
  if (current.year) params.set("year", String(current.year));
  if (current.dateFrom) params.set("from", current.dateFrom);
  if (current.dateTo) params.set("to", current.dateTo);

  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  // Any filter change resets to page 1 — a page number from the old result
  // set has no guaranteed meaning against a new filter combination.
  params.delete("page");
  return params.toString();
}

function toggleInCsv(csv: string, value: string): string {
  const parts = csv ? csv.split(",") : [];
  const next = parts.includes(value) ? parts.filter((p) => p !== value) : [...parts, value];
  return next.join(",");
}

export function ExploreFilterBar({
  filmStocks,
  cameras,
  lenses,
  focalLengths,
  apertureOptions,
  shutterSpeedOptions,
  years,
  tags,
  locations,
  current,
}: {
  filmStocks: Option[];
  cameras: Option[];
  lenses: Option[];
  focalLengths: string[];
  apertureOptions: number[];
  shutterSpeedOptions: string[];
  years: number[];
  tags: Option[];
  locations: Option[];
  current: ExploreFilters;
}) {
  const router = useRouter();

  function go(patch: Record<string, string | null>) {
    router.push(`/explore?${updateParams(current, patch)}`);
  }

  const selectClass =
    "field min-w-[8.5rem] flex-1";
  const pillClass = (active: boolean) =>
    `numeral flex h-10 shrink-0 items-center border px-3.5 text-sm transition-colors ${
      active
        ? "border-accent text-accent"
        : "border-border text-muted hover:text-foreground"
    }`;

  const activeCount = [
    current.filmStockId, current.cameraId, current.lensId, current.focalLength,
    current.meterType, current.exposureEvaluation, current.favoritesOnly,
    current.tagId, current.locationId, current.year, current.dateFrom, current.dateTo,
  ].filter(Boolean).length +
    (current.apertures.length > 0 ? 1 : 0) +
    (current.shutterSpeeds.length > 0 ? 1 : 0) +
    0;

  const hasFilters =
    current.filmStockId ||
    current.cameraId ||
    current.lensId ||
    current.focalLength ||
    current.apertures.length > 0 ||
    current.shutterSpeeds.length > 0 ||
    current.meterType ||
    current.exposureEvaluation ||
    current.favoritesOnly ||
    current.tagId ||
    current.locationId ||
    current.year ||
    current.dateFrom ||
    current.dateTo;

  return (
    <details className="border-y border-border">
      <summary className="flex h-12 cursor-pointer list-none items-center justify-between marker:content-none">
        <span className="label !text-foreground">Filters</span>
        <span className={`label ${activeCount > 0 ? "!text-accent" : ""}`}>
          {activeCount > 0 ? `${activeCount} active` : "None"}
        </span>
      </summary>
      <div className="space-y-6 pb-6 pt-2">
      <div className="flex flex-wrap gap-3">
        <select
          value={current.filmStockId ?? ""}
          onChange={(e) => go({ fs: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any film stock</option>
          {filmStocks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <select
          value={current.cameraId ?? ""}
          onChange={(e) => go({ cam: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any camera</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={current.lensId ?? ""}
          onChange={(e) => go({ lens: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any lens</option>
          {lenses.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <select
          value={current.focalLength ?? ""}
          onChange={(e) => go({ focal: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any focal length</option>
          {focalLengths.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select
          value={current.year ?? ""}
          onChange={(e) => go({ year: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={current.meterType ?? ""}
          onChange={(e) => go({ meter: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any meter</option>
          {METER_TYPES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={current.exposureEvaluation ?? ""}
          onChange={(e) => go({ eval: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any evaluation</option>
          {EXPOSURE_EVALUATIONS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        <select
          value={current.tagId ?? ""}
          onChange={(e) => go({ tag: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={current.locationId ?? ""}
          onChange={(e) => go({ loc: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Any location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => go({ fav: current.favoritesOnly ? null : "1" })}
          className={pillClass(current.favoritesOnly)}
        >
          ★ Favorites only
        </button>
      </div>

      {apertureOptions.length > 0 && (
        <div>
          <span className="label mb-2 block">Aperture</span>
          <div className="flex flex-wrap gap-2">
            {apertureOptions.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() =>
                  go({ ap: toggleInCsv(current.apertures.join(","), String(a)) || null })
                }
                className={pillClass(current.apertures.includes(a))}
              >
                {formatAperture(a)}
              </button>
            ))}
          </div>
        </div>
      )}

      {shutterSpeedOptions.length > 0 && (
        <div>
          <span className="label mb-2 block">
            Shutter speed
          </span>
          <div className="flex flex-wrap gap-2">
            {shutterSpeedOptions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => go({ sh: toggleInCsv(current.shutterSpeeds.join(","), s) || null })}
                className={pillClass(current.shutterSpeeds.includes(s))}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          From
          <input
            type="date"
            value={current.dateFrom ?? ""}
            onChange={(e) => go({ from: e.target.value || null })}
            className={`mt-1 block ${selectClass}`}
          />
        </label>
        <label className="text-xs text-muted">
          To
          <input
            type="date"
            value={current.dateTo ?? ""}
            onChange={(e) => go({ to: e.target.value || null })}
            className={`mt-1 block ${selectClass}`}
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => router.push("/explore")}
            className="label h-10 hover:!text-foreground"
          >
            Clear all filters
          </button>
        )}
      </div>
      </div>
    </details>
  );
}

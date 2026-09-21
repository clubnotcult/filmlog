"use client";

import { useRouter } from "next/navigation";
import { formatAperture, formatPush } from "@/lib/exposure-format";
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
  if (current.pushPulls.length > 0) params.set("push", current.pushPulls.join(","));
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
  current,
}: {
  filmStocks: Option[];
  cameras: Option[];
  lenses: Option[];
  focalLengths: string[];
  apertureOptions: number[];
  shutterSpeedOptions: string[];
  years: number[];
  current: ExploreFilters;
}) {
  const router = useRouter();

  function go(patch: Record<string, string | null>) {
    router.push(`/explore?${updateParams(current, patch)}`);
  }

  const selectClass =
    "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent";
  const pillClass = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
      active
        ? "border-accent bg-accent text-black"
        : "border-border bg-surface text-muted hover:text-foreground"
    }`;

  const hasFilters =
    current.filmStockId ||
    current.cameraId ||
    current.lensId ||
    current.focalLength ||
    current.apertures.length > 0 ||
    current.shutterSpeeds.length > 0 ||
    current.pushPulls.length > 0 ||
    current.year ||
    current.dateFrom ||
    current.dateTo;

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface px-4 py-4">
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
      </div>

      {apertureOptions.length > 0 && (
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted">Aperture</span>
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
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted">
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

      <div>
        <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted">Push / Pull</span>
        <div className="flex flex-wrap gap-2">
          {[-2, -1, 0, 1, 2].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => go({ push: toggleInCsv(current.pushPulls.join(","), String(p)) || null })}
              className={pillClass(current.pushPulls.includes(p))}
            >
              {formatPush(p)}
            </button>
          ))}
        </div>
      </div>

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
            className="text-xs text-muted hover:text-foreground"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}

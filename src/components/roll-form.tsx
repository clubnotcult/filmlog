"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormError, inputClass } from "@/components/form-controls";
import { TagChips } from "@/components/tag-chips";
import { FilmCard } from "@/components/film-card";
import { formatLongDate, todayIsoDate } from "@/lib/date";
import { generateRollTitle } from "@/lib/roll-title";
import { parseFilmCardDesign } from "@/lib/film-card";
import { apertureApplies, shutterApplies } from "@/lib/camera-exposure";
import { getDriveAccessToken, hasGoogleDriveEnv } from "@/lib/google-drive";
import { pickImageSource, type ImageSource } from "@/lib/google-drive/image-source";
import { importPayload, pushDriveUpdates } from "@/components/roll-lifecycle/import-roll-panel";
import type { Camera, FilmInventoryItem, FilmStock, Lens } from "@/lib/database.types";
import { createRoll } from "@/app/(app)/rolls/actions";
import { importRollImages } from "@/app/(app)/rolls/[id]/sync/actions";

function describeItem(item: FilmInventoryItem): string {
  const parts = [`${item.quantity} in stock`];
  if (item.expiration_date) parts.push(`exp. ${formatLongDate(item.expiration_date)}`);
  if (item.storage_notes) parts.push(item.storage_notes);
  return parts.join(" · ");
}

/**
 * Creating a roll is quick: camera, film, start date. Everything else —
 * lens, location, global tags, notes, inventory, images — is optional and
 * none of it is a shooting session. If a Drive folder is chosen, its JPEGs
 * are imported as frames right after the roll is created, so a scanned roll
 * goes from nothing to a reviewable contact sheet in one step.
 */
export function RollForm({
  filmStocks,
  inventoryItems,
  cameras,
  lenses,
  locationNames,
  tagNames,
}: {
  filmStocks: FilmStock[];
  inventoryItems: FilmInventoryItem[];
  cameras: Camera[];
  lenses: Lens[];
  locationNames: string[];
  tagNames: string[];
}) {
  const router = useRouter();
  const [cameraId, setCameraId] = useState("");
  const [filmStockId, setFilmStockId] = useState("");
  const [startDate, setStartDate] = useState(todayIsoDate);
  const [customTitle, setCustomTitle] = useState("");
  const [lensId, setLensId] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [useInventory, setUseInventory] = useState(true);
  const [itemId, setItemId] = useState("");
  const [source, setSource] = useState<ImageSource | null>(null);
  const [sourceState, setSourceState] = useState<"idle" | "reading">("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stock = filmStocks.find((f) => f.id === filmStockId) ?? null;
  const camera = cameras.find((c) => c.id === cameraId) ?? null;
  const items = useMemo(
    () => inventoryItems.filter((i) => i.film_stock_id === filmStockId && i.quantity > 0),
    [inventoryItems, filmStockId],
  );
  const consuming = useInventory && items.length > 0;
  const effectiveItemId = consuming ? itemId || items[0]?.id || "" : "";
  const automatic = camera ? !shutterApplies(camera.exposure_control) && !apertureApplies(camera.exposure_control) : false;

  const titlePreview = stock
    ? generateRollTitle({ startDate, endDate: null, filmStockName: stock.name, customTitle })
    : null;

  async function chooseFolder() {
    setError(null);
    setSourceState("reading");
    try {
      const token = await getDriveAccessToken();
      const found = await pickImageSource(token);
      if (found && found.files.length === 0) setError(`No JPEGs found in “${found.folder.name}”.`);
      else if (found) setSource(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open Google Drive.");
    } finally {
      setSourceState("idle");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cameraId) return setError("Select a camera.");
    if (!filmStockId) return setError("Select a film stock.");
    setError(null);
    setSubmitting(true);
    setStatus("Creating roll…");

    const created = await createRoll({
      filmStockId,
      cameraId,
      startDate,
      filmInventoryItemId: effectiveItemId || null,
      defaultLensId: lensId || null,
      customTitle: customTitle.trim() || null,
      notes: notes.trim() || null,
      locationName: location.trim() || null,
      tagNames: tags,
    });
    if (!created.ok) {
      setSubmitting(false);
      setStatus(null);
      return setError(created.error);
    }

    const rollId = created.data.id;
    if (source) {
      setStatus(`Importing ${source.files.length} images…`);
      const imported = await importRollImages(rollId, source.folder.id, source.folder.name, importPayload(source));
      if (imported.ok) {
        pushDriveUpdates(imported.data.driveUpdates);
      } else {
        // The roll exists either way; land on it with the reason, and the
        // import can be retried from there without creating anything twice.
        router.push(`/rolls/${rollId}?importError=${encodeURIComponent(imported.error)}`);
        return;
      }
    }
    router.push(`/rolls/${rollId}`);
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-5">
      <Field label="Camera" htmlFor="camera_id" hint={automatic ? "Automatic camera — no shutter or aperture to log." : undefined}>
        <select id="camera_id" required value={cameraId} onChange={(e) => setCameraId(e.target.value)} className={inputClass}>
          <option value="" disabled>
            Select camera
          </option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Film stock" htmlFor="film_stock_id">
        <div className="flex items-center gap-3">
          <select
            id="film_stock_id"
            required
            value={filmStockId}
            onChange={(e) => {
              setFilmStockId(e.target.value);
              setItemId("");
            }}
            className={`${inputClass} flex-1`}
          >
            <option value="" disabled>
              Select film stock
            </option>
            {filmStocks.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.iso ? ` · ISO ${f.iso}` : ""}
              </option>
            ))}
          </select>
          {stock && <FilmCard design={parseFilmCardDesign(stock.card_design)} iso={stock.iso} name={stock.name} size="sm" />}
        </div>
      </Field>

      {stock && (
        <div className="space-y-2">
          {items.length > 0 ? (
            <>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={useInventory}
                  onChange={(e) => setUseInventory(e.target.checked)}
                  className="h-4 w-4"
                />
                Use one roll from inventory
              </label>
              {useInventory && items.length > 1 && (
                <select value={effectiveItemId} onChange={(e) => setItemId(e.target.value)} className={inputClass}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {describeItem(i)}
                    </option>
                  ))}
                </select>
              )}
              {useInventory && items.length === 1 && <p className="text-xs text-muted">{describeItem(items[0])}</p>}
            </>
          ) : (
            <p className="text-xs text-muted">None in inventory — the roll is created without touching stock.</p>
          )}
        </div>
      )}

      <Field label="Start date" htmlFor="start_date">
        <input
          id="start_date"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Title" htmlFor="custom_title" hint={titlePreview ?? "Built from the date and film stock; add your own words after them."}>
        <input
          id="custom_title"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder="Maddie, Cats, Kendrick, PMC"
          className={inputClass}
        />
      </Field>

      <details className="group border-y border-border py-3" open={Boolean(lensId || location || tags.length || notes)}>
        <summary className="label cursor-pointer list-none !text-muted-strong hover:!text-foreground">
          Shared details <span className="text-muted">· optional</span>
        </summary>
        <div className="mt-4 space-y-4">
          <Field label="Default lens" htmlFor="default_lens_id" hint="Leave as unknown if you're not sure — nothing is guessed.">
            <select id="default_lens_id" value={lensId} onChange={(e) => setLensId(e.target.value)} className={inputClass}>
              <option value="">Unknown / not set</option>
              {lenses.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location" htmlFor="location">
            <input
              id="location"
              list="roll-location-suggestions"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Panama City"
              autoComplete="off"
              className={inputClass}
            />
            <datalist id="roll-location-suggestions">
              {locationNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>

          <div className="space-y-0.5">
            <span className="label block">Tags</span>
            <TagChips
              tags={tags}
              onAdd={(t) => setTags((prev) => [...prev, t])}
              onRemove={(t) => setTags((prev) => prev.filter((x) => x !== t))}
              suggestions={tagNames}
              listId="roll-tag-suggestions"
              placeholder="World of Coffee, travel…"
            />
          </div>

          <Field label="Notes" htmlFor="notes">
            <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </details>

      {hasGoogleDriveEnv() && (
        <div className="space-y-2">
          <span className="label block">Images</span>
          {source ? (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p className="min-w-0 text-foreground">
                <span className="numeral">{source.files.length}</span> JPEGs in &ldquo;{source.folder.name}&rdquo;
                <span className="block truncate font-mono text-xs text-muted">
                  {source.files[0]?.name} → {source.files[source.files.length - 1]?.name}
                </span>
              </p>
              <button type="button" onClick={() => setSource(null)} className="label shrink-0 hover:!text-foreground">
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={chooseFolder}
              disabled={sourceState === "reading"}
              className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50"
            >
              {sourceState === "reading" ? "Opening Drive…" : "Choose JPEG folder"}
            </button>
          )}
          <p className="text-xs text-muted">
            Optional. One frame is created for every image, in filename order. You can also import later.
          </p>
        </div>
      )}

      <FormError error={error} />

      <button
        type="submit"
        disabled={submitting}
        className="numeral flex h-11 items-center bg-accent px-6 text-sm font-medium uppercase tracking-[0.14em] text-black transition-opacity disabled:opacity-40"
      >
        {submitting ? (status ?? "Saving…") : source ? `Create roll · import ${source.files.length}` : "Create roll"}
      </button>
    </form>
  );
}

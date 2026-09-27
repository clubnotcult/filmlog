"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { formatLongDate, todayIsoDate } from "@/lib/date";
import type { Camera, FilmInventoryItem, FilmStock, Lens } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/rolls/actions";

function describeItem(item: FilmInventoryItem): string {
  const parts = [`${item.quantity} available`];
  if (item.expiration_date) parts.push(`expires ${formatLongDate(item.expiration_date)}`);
  if (item.storage_notes) parts.push(item.storage_notes);
  return parts.join(" — ");
}

export function RollForm({
  filmStocks,
  inventoryItems,
  cameras,
  lenses,
  action,
}: {
  filmStocks: FilmStock[];
  inventoryItems: FilmInventoryItem[];
  cameras: Camera[];
  lenses: Lens[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  const [filmStockId, setFilmStockId] = useState("");

  const availableItems = useMemo(
    () => inventoryItems.filter((item) => item.film_stock_id === filmStockId),
    [inventoryItems, filmStockId],
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <Field label="Film stock" htmlFor="film_stock_id">
        <select
          id="film_stock_id"
          name="film_stock_id_display"
          required
          value={filmStockId}
          onChange={(e) => setFilmStockId(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Select film stock
          </option>
          {filmStocks.map((stock) => (
            <option key={stock.id} value={stock.id}>
              {stock.name}
              {stock.iso ? ` (ISO ${stock.iso})` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Inventory item"
        htmlFor="film_inventory_item_id"
        hint={
          filmStockId && availableItems.length === 0
            ? "No inventory with stock available for this film — add some first"
            : "Which physical batch to shoot and consume one unit from"
        }
      >
        <select
          id="film_inventory_item_id"
          name="film_inventory_item_id"
          required
          disabled={!filmStockId || availableItems.length === 0}
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            {filmStockId ? "Select inventory item" : "Select a film stock first"}
          </option>
          {availableItems.map((item) => (
            <option key={item.id} value={item.id}>
              {describeItem(item)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Camera" htmlFor="camera_id">
        <select
          id="camera_id"
          name="camera_id"
          required
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Select camera
          </option>
          {cameras.map((camera) => (
            <option key={camera.id} value={camera.id}>
              {camera.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Default lens" htmlFor="default_lens_id" hint="Can be changed per frame once shooting starts">
        <select
          id="default_lens_id"
          name="default_lens_id"
          required
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Select lens
          </option>
          {lenses.map((lens) => (
            <option key={lens.id} value={lens.id}>
              {lens.name}
              {lens.focal_length ? ` (${lens.focal_length})` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Start date" htmlFor="start_date">
        <input
          id="start_date"
          name="start_date"
          type="date"
          required
          defaultValue={todayIsoDate()}
          className={inputClass}
        />
      </Field>

      <Field
        label="Custom title"
        htmlFor="custom_title"
        hint="Optional — appears after the date and film stock, e.g. “Maddie, Cats, Kendrick, PMC”"
      >
        <input id="custom_title" name="custom_title" className={inputClass} />
      </Field>

      <Field label="Notes" htmlFor="notes" hint="Optional">
        <textarea id="notes" name="notes" rows={3} className={inputClass} />
      </Field>

      <FormError error={state.error} />

      <SubmitButton pendingChildren="Starting roll…">Start roll</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { todayIsoDate } from "@/lib/date";
import type { Camera, FilmStock, Lens } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/rolls/actions";

export function RollForm({
  filmStocks,
  cameras,
  lenses,
  action,
}: {
  filmStocks: FilmStock[];
  cameras: Camera[];
  lenses: Lens[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <Field label="Film stock" htmlFor="film_stock_id">
        <select
          id="film_stock_id"
          name="film_stock_id"
          required
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Select film stock
          </option>
          {filmStocks.map((stock) => (
            <option key={stock.id} value={stock.id}>
              {stock.name}
              {stock.iso ? ` (ISO ${stock.iso})` : ""} — {stock.quantity} in
              stock
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

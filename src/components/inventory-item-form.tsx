"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import type { FilmInventoryItem, FilmStock } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/inventory/actions";

export function InventoryItemForm({
  initial,
  filmStocks,
  action,
  submitLabel,
}: {
  initial?: FilmInventoryItem;
  filmStocks: FilmStock[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <Field
        label="Film stock"
        htmlFor="film_stock_id"
        hint={
          filmStocks.length === 0
            ? "No film stocks yet — add one first"
            : "Which reusable film type this physical batch is"
        }
      >
        <select
          id="film_stock_id"
          name="film_stock_id"
          required
          defaultValue={initial?.film_stock_id ?? ""}
          disabled={filmStocks.length === 0}
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
        label="Quantity"
        htmlFor="quantity"
        hint="Unused rolls of this specific batch currently in inventory"
      >
        <input
          id="quantity"
          name="quantity"
          type="number"
          min={0}
          step={1}
          defaultValue={initial?.quantity ?? 0}
          className={inputClass}
        />
      </Field>

      <Field label="Expiration date" htmlFor="expiration_date" hint="Optional">
        <input
          id="expiration_date"
          name="expiration_date"
          type="date"
          defaultValue={initial?.expiration_date ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Storage notes" htmlFor="storage_notes" hint="Optional">
        <textarea
          id="storage_notes"
          name="storage_notes"
          rows={3}
          defaultValue={initial?.storage_notes ?? ""}
          className={inputClass}
        />
      </Field>

      <FormError error={state.error} />

      <SubmitButton disabled={filmStocks.length === 0}>{submitLabel}</SubmitButton>
    </form>
  );
}

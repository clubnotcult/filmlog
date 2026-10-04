"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import type { FilmStock } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/inventory/actions";

export function FilmStockForm({
  initial,
  action,
  submitLabel,
}: {
  initial?: FilmStock;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <Field
        label="Name"
        htmlFor="name"
        hint="The film itself — this stays the same every time you buy more"
      >
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="Kodak Portra 400"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="ISO" htmlFor="iso" hint="Optional">
          <input
            id="iso"
            name="iso"
            type="number"
            min={1}
            defaultValue={initial?.iso ?? ""}
            placeholder="400"
            className={inputClass}
          />
        </Field>
        <Field label="Format" htmlFor="format" hint="Optional">
          <input
            id="format"
            name="format"
            defaultValue={initial?.format ?? ""}
            placeholder="35mm"
            className={inputClass}
          />
        </Field>
      </div>

      <FormError error={state.error} />

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { formatApertureStops } from "@/lib/gear-values";
import type { Lens } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/gear/actions";

export function LensForm({
  initial,
  action,
  submitLabel,
}: {
  initial?: Lens;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <Field label="Name" htmlFor="name">
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="FD 50mm f/1.4"
          className={inputClass}
        />
      </Field>

      <Field label="Focal length" htmlFor="focal_length" hint="Optional, e.g. 50 or 24-70">
        <input
          id="focal_length"
          name="focal_length"
          defaultValue={initial?.focal_length ?? ""}
          placeholder="50mm"
          className={inputClass}
        />
      </Field>

      <Field
        label="Available aperture stops"
        htmlFor="aperture_stops"
        hint="Comma-separated, in the order they should appear (e.g. 1.4, 2, 2.8, 4, 5.6, 8, 11, 16). These are exactly the values the active roll will offer for this lens."
      >
        <input
          id="aperture_stops"
          name="aperture_stops"
          required
          defaultValue={
            initial
              ? formatApertureStops(initial.aperture_stops).replace(/f\//g, "")
              : ""
          }
          placeholder="1.4, 2, 2.8, 4, 5.6, 8, 11, 16"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Minimum aperture"
          htmlFor="min_aperture"
          hint="Optional — derived from stops if left blank"
        >
          <input
            id="min_aperture"
            name="min_aperture"
            type="number"
            step="0.1"
            defaultValue={initial?.min_aperture ?? ""}
            className={inputClass}
          />
        </Field>
        <Field
          label="Maximum aperture"
          htmlFor="max_aperture"
          hint="Optional — derived from stops if left blank"
        >
          <input
            id="max_aperture"
            name="max_aperture"
            type="number"
            step="0.1"
            defaultValue={initial?.max_aperture ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Optional">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial?.notes ?? ""}
          className={inputClass}
        />
      </Field>

      <FormError error={state.error} />

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

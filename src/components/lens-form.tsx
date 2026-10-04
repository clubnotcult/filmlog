"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { ApertureStopsField } from "@/components/gear/aperture-stops-field";
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

      <ApertureStopsField
        initialStopsValue={initial ? formatApertureStops(initial.aperture_stops).replace(/f\//g, "") : ""}
        initialMin={initial?.min_aperture ?? null}
        initialMax={initial?.max_aperture ?? null}
      />

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

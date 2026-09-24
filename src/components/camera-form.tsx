"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { formatShutterSpeeds } from "@/lib/gear-values";
import { METER_TYPES } from "@/lib/database.types";
import type { Camera } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/gear/actions";

export function CameraForm({
  initial,
  action,
  submitLabel,
}: {
  initial?: Camera;
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
          placeholder="Canon A-1"
          className={inputClass}
        />
      </Field>

      <Field label="Format" htmlFor="format" hint="Optional, e.g. 35mm">
        <input
          id="format"
          name="format"
          defaultValue={initial?.format ?? ""}
          placeholder="35mm"
          className={inputClass}
        />
      </Field>

      <Field
        label="Available shutter speeds"
        htmlFor="shutter_speeds"
        hint="Comma-separated, in the order they should appear (e.g. B, 1, 1/2, 1/4, 1/125, 1/1000). These are exactly the values the active roll will offer for this camera."
      >
        <input
          id="shutter_speeds"
          name="shutter_speeds"
          required
          defaultValue={
            initial ? formatShutterSpeeds(initial.shutter_speeds) : ""
          }
          placeholder="B, 1, 1/2, 1/4, 1/8, 1/15, 1/30, 1/60, 1/125, 1/250, 1/500, 1/1000"
          className={inputClass}
        />
      </Field>

      <Field
        label="Default meter type"
        htmlFor="default_meter_type"
        hint="Pre-selected on Frame 1 when shooting with this camera"
      >
        <select
          id="default_meter_type"
          name="default_meter_type"
          defaultValue={initial?.default_meter_type ?? ""}
          className={inputClass}
        >
          <option value="">None</option>
          {METER_TYPES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

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

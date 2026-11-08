"use client";

import { useActionState, useState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { ShutterSpeedField } from "@/components/gear/shutter-speed-field";
import { formatShutterSpeeds } from "@/lib/gear-values";
import { METER_TYPES } from "@/lib/database.types";
import type { Camera } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/gear/actions";
import { EXPOSURE_CONTROLS, shutterApplies, type ExposureControl } from "@/lib/camera-exposure";

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
  const [exposureControl, setExposureControl] = useState<ExposureControl>(
    initial?.exposure_control ?? "manual",
  );

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

      <Field
        label="Abbreviation"
        htmlFor="abbreviation"
        hint="Optional. Shown under each image in the gallery, e.g. F-1"
      >
        <input
          id="abbreviation"
          name="abbreviation"
          defaultValue={initial?.abbreviation ?? ""}
          maxLength={12}
          autoComplete="off"
          placeholder="A-1"
          className={`${inputClass} font-mono`}
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
        label="Exposure control"
        htmlFor="exposure_control"
        hint={EXPOSURE_CONTROLS.find((c) => c.value === exposureControl)?.hint}
      >
        <select
          id="exposure_control"
          name="exposure_control"
          value={exposureControl}
          onChange={(e) => setExposureControl(e.target.value as ExposureControl)}
          className={inputClass}
        >
          {EXPOSURE_CONTROLS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Hidden (not removed) when the camera sets its own shutter, so any
          speeds already saved are kept rather than wiped. */}
      <div className={shutterApplies(exposureControl) ? undefined : "hidden"}>
        <ShutterSpeedField
          initialValue={initial ? formatShutterSpeeds(initial.shutter_speeds) : ""}
        />
      </div>

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

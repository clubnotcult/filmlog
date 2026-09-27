"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { METER_TYPES } from "@/lib/database.types";
import type { Camera, Frame, Lens } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/rolls/[id]/frames/actions";

export function FrameEditForm({
  frame,
  camera,
  lenses,
  action,
  returnTo,
}: {
  frame: Frame;
  camera: Camera;
  lenses: Lens[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  returnTo?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  const [metadataLogged, setMetadataLogged] = useState(frame.metadata_logged);
  const [lensId, setLensId] = useState(frame.lens_id ?? lenses[0]?.id ?? "");
  const [aperture, setAperture] = useState<string>(
    frame.aperture !== null ? String(frame.aperture) : "",
  );

  const selectedLens = useMemo(
    () => lenses.find((l) => l.id === lensId) ?? null,
    [lenses, lensId],
  );
  const apertureOptions = selectedLens?.aperture_stops ?? [];

  function handleLensChange(newLensId: string) {
    setLensId(newLensId);
    const newLens = lenses.find((l) => l.id === newLensId);
    if (newLens && aperture && !newLens.aperture_stops.includes(Number(aperture))) {
      // Never silently keep an aperture the new lens doesn't support.
      setAperture("");
    }
  }

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <input type="hidden" name="metadata_logged" value={String(metadataLogged)} />
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}

      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5">
        <input
          id="metadata_logged_toggle"
          type="checkbox"
          checked={metadataLogged}
          onChange={(e) => setMetadataLogged(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="metadata_logged_toggle" className="text-sm text-foreground">
          Exposure metadata logged
        </label>
      </div>

      {metadataLogged ? (
        <>
          <Field label="Shutter speed" htmlFor="shutter_speed">
            <select
              id="shutter_speed"
              name="shutter_speed"
              required
              defaultValue={frame.shutter_speed ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                Select shutter speed
              </option>
              {camera.shutter_speeds.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Aperture"
            htmlFor="aperture"
            hint={
              apertureOptions.length === 0
                ? "Selected lens has no aperture stops configured"
                : undefined
            }
          >
            <select
              id="aperture"
              name="aperture"
              required
              value={aperture}
              onChange={(e) => setAperture(e.target.value)}
              disabled={apertureOptions.length === 0}
              className={inputClass}
            >
              <option value="" disabled>
                Select aperture
              </option>
              {apertureOptions.map((a) => (
                <option key={a} value={a}>
                  f/{a}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Lens" htmlFor="lens_id">
            <select
              id="lens_id"
              name="lens_id"
              required
              value={lensId}
              onChange={(e) => handleLensChange(e.target.value)}
              className={inputClass}
            >
              {lenses.map((lens) => (
                <option key={lens.id} value={lens.id}>
                  {lens.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Push / Pull" htmlFor="push_pull" hint="0 = normal">
            <input
              id="push_pull"
              name="push_pull"
              type="number"
              step={0.5}
              defaultValue={frame.push_pull ?? 0}
              className={inputClass}
            />
          </Field>

          <Field label="Meter type" htmlFor="meter_type" hint="Optional">
            <select
              id="meter_type"
              name="meter_type"
              defaultValue={frame.meter_type ?? ""}
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
        </>
      ) : (
        <p className="rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-muted-strong">
          This frame will be saved with exposure metadata marked unknown.
        </p>
      )}

      <Field label="Note" htmlFor="notes" hint="Optional">
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={frame.notes ?? ""}
          className={inputClass}
        />
      </Field>

      <FormError error={state.error} />

      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { METER_TYPES } from "@/lib/database.types";
import type { Camera, Frame, Lens } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/rolls/[id]/frames/actions";
import { apertureApplies, exposureControlLabel, shutterApplies } from "@/lib/camera-exposure";

export function FrameEditForm({
  frame,
  camera,
  lenses,
  action,
  returnTo,
  inheritedLensName = null,
}: {
  frame: Frame;
  camera: Camera;
  lenses: Lens[];
  /** The roll's default lens, used when this frame names none. */
  inheritedLensName?: string | null;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  returnTo?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {
    error: null,
  });

  const [metadataLogged, setMetadataLogged] = useState(frame.metadata_logged);
  // "" = no lens on this frame: it inherits the roll's default (or stays
  // unknown). Never pre-filled with an arbitrary lens.
  const [lensId, setLensId] = useState(frame.lens_id ?? "");
  const needShutter = shutterApplies(camera.exposure_control);
  const needAperture = apertureApplies(camera.exposure_control);
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

      <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-2.5">
        <input
          id="metadata_logged_toggle"
          type="checkbox"
          checked={metadataLogged}
          onChange={(e) => setMetadataLogged(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="metadata_logged_toggle" className="text-sm text-foreground">
          I know this frame&apos;s exposure settings
        </label>
      </div>

      {/* Location is edited on the frame view; round-trip it so saving here never clears it. */}
      <input type="hidden" name="location_id" value={frame.location_id ?? ""} />

      <Field
        label="Lens"
        htmlFor="lens_id"
        hint={
          metadataLogged && needAperture
            ? "Required to log an aperture"
            : "Set only if this frame used a different lens than the roll"
        }
      >
        <select
          id="lens_id"
          name="lens_id"
          required={metadataLogged && needAperture}
          value={lensId}
          onChange={(e) => handleLensChange(e.target.value)}
          className={inputClass}
        >
          <option value="">
            {inheritedLensName ? `Inherit from roll — ${inheritedLensName}` : "Unknown (no roll default)"}
          </option>
          {lenses.map((lens) => (
            <option key={lens.id} value={lens.id}>
              {lens.name}
            </option>
          ))}
        </select>
      </Field>

      {metadataLogged ? (
        <>
          {!needShutter && !needAperture && (
            <p className="border-l-2 border-border py-1 pl-4 text-sm text-muted-strong">
              {camera.name} is {exposureControlLabel(camera.exposure_control).toLowerCase()} — shutter and
              aperture are set by the camera and not logged.
            </p>
          )}

          {needShutter && (
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
          )}

          {needAperture && (
            <Field
              label="Aperture"
              htmlFor="aperture"
              hint={
                !selectedLens
                  ? "Choose a lens first"
                  : apertureOptions.length === 0
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
          )}

          {/* Push/pull is no longer an active field (removed from the
              workflow), but this hidden input round-trips whatever value a
              frame already has so editing other fields here never resets
              historical push/pull data to 0. */}
          <input type="hidden" name="push_pull" value={frame.push_pull ?? 0} />

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
        <p className="border-l-2 border-border py-1 pl-4 text-sm text-muted-strong">
          No exposure logged — shutter, aperture and meter stay unknown. Turn this on only to record
          settings you actually know.
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

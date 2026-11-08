"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, inputClass } from "@/components/form-controls";
import { FILM_FORMATS, FILM_TYPES } from "@/lib/film-classification";
import type { FilmStock } from "@/lib/database.types";
import type { FormState } from "@/app/(app)/inventory/actions";
import { FilmCardDesigner } from "@/components/film-card-designer";
import { parseFilmCardDesign } from "@/lib/film-card";

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
        <Field label="Format" htmlFor="format" hint="Drives the format tag">
          <select
            id="format"
            name="format"
            required
            defaultValue={initial ? (initial.format ?? "") : "35mm"}
            className={inputClass}
          >
            <option value="" disabled>
              Select format
            </option>
            {FILM_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Film type"
        htmlFor="film_type"
        hint={
          initial && !initial.film_type
            ? "This stock isn't classified yet. Choose its type; it's added to every frame's tags automatically."
            : "Added to every frame's tags automatically"
        }
      >
        <select
          id="film_type"
          name="film_type"
          required
          defaultValue={initial?.film_type ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Select film type
          </option>
          {FILM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <FilmCardDesigner
        initial={parseFilmCardDesign(initial?.card_design)}
        stockName={initial?.name ?? ""}
        iso={initial?.iso ?? null}
      />

      <FormError error={state.error} />

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

"use client";

import { useState } from "react";
import {
  generateApertureStops,
  STOP_INCREMENT_LABELS,
  type StopIncrement,
} from "@/lib/gear-stops";
import { formatApertureStops } from "@/lib/gear-values";
import { Field, inputClass } from "@/components/form-controls";

export function ApertureStopsField({
  initialStopsValue,
  initialMin,
  initialMax,
}: {
  initialStopsValue: string;
  initialMin: number | null;
  initialMax: number | null;
}) {
  const [mode, setMode] = useState<"generate" | "custom">("custom");
  const [min, setMin] = useState(initialMin ?? 1.4);
  const [max, setMax] = useState(initialMax ?? 16);
  const [increment, setIncrement] = useState<StopIncrement>("half");
  const [customValue, setCustomValue] = useState(initialStopsValue);
  const [customMin, setCustomMin] = useState(initialMin ?? "");
  const [customMax, setCustomMax] = useState(initialMax ?? "");

  const generatedStops = generateApertureStops(min, max, increment);
  const generatedValue = formatApertureStops(generatedStops).replace(/f\//g, "");

  const stopsValue = mode === "generate" ? generatedValue : customValue;
  const minValue = mode === "generate" ? String(min) : String(customMin);
  const maxValue = mode === "generate" ? String(max) : String(customMax);

  return (
    <div className="space-y-2">
      <div className="flex h-3 items-center justify-between">
        <span className="label">Aperture stops</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setMode("generate")}
            className={`label ${mode === "generate" ? "!text-accent" : ""}`}
          >
            Generate
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`label ${mode === "custom" ? "!text-accent" : ""}`}
          >
            Custom
          </button>
        </div>
      </div>

      {mode === "generate" ? (
        <div className="grid grid-cols-3 gap-4">
          <label className="space-y-0.5">
            <span className="label block">Max aperture</span>
            <input
              type="number"
              step="0.1"
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="space-y-0.5">
            <span className="label block">Min aperture</span>
            <input
              type="number"
              step="0.1"
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="space-y-0.5">
            <span className="label block">Increment</span>
            <select
              value={increment}
              onChange={(e) => setIncrement(e.target.value as StopIncrement)}
              className={inputClass}
            >
              {(Object.keys(STOP_INCREMENT_LABELS) as StopIncrement[]).map((inc) => (
                <option key={inc} value={inc}>
                  {STOP_INCREMENT_LABELS[inc]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="1.4, 2, 2.8, 4, 5.6, 8, 11, 16"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min aperture (widest)" htmlFor="_min_display" hint="Optional">
              <input
                type="number"
                step="0.1"
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Max aperture (narrowest)" htmlFor="_max_display" hint="Optional">
              <input
                type="number"
                step="0.1"
                value={customMax}
                onChange={(e) => setCustomMax(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </>
      )}

      {mode === "generate" && (
        <p className="text-xs leading-snug text-muted">
          f/{min} to f/{max}, {STOP_INCREMENT_LABELS[increment].toLowerCase()}: f/{generatedValue}
        </p>
      )}

      {/* The fields the server action actually reads — always in sync with whichever mode is active. */}
      <input type="hidden" name="aperture_stops" value={stopsValue} />
      <input type="hidden" name="min_aperture" value={minValue} />
      <input type="hidden" name="max_aperture" value={maxValue} />
    </div>
  );
}

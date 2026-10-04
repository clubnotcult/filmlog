"use client";

import { useState } from "react";
import {
  generateShutterSpeeds,
  FASTEST_SHUTTER_OPTIONS,
  STOP_INCREMENT_LABELS,
  type StopIncrement,
} from "@/lib/gear-stops";
import { formatShutterSpeeds } from "@/lib/gear-values";
import { inputClass } from "@/components/form-controls";

/**
 * Two modes over the same underlying `shutter_speeds` text field the server
 * action already parses (comma-separated) — nothing about storage, the RPC,
 * or existing gear changes. Generate mode computes the value client-side
 * from a standard stop table and writes it into that same field; Custom
 * mode is exactly the original manual text input. Switching to Generate
 * never touches existing gear until the form is actually submitted, so
 * loading a camera to edit its meter type doesn't silently rewrite its
 * hand-entered scale.
 */
export function ShutterSpeedField({ initialValue }: { initialValue: string }) {
  const [mode, setMode] = useState<"generate" | "custom">("custom");
  const [fastest, setFastest] = useState(1000);
  const [increment, setIncrement] = useState<StopIncrement>("full");
  const [customValue, setCustomValue] = useState(initialValue);

  const generatedValue = formatShutterSpeeds(generateShutterSpeeds(fastest, increment));
  const value = mode === "generate" ? generatedValue : customValue;

  return (
    <div className="space-y-2">
      <div className="flex h-3 items-center justify-between">
        <span className="label">Shutter speeds</span>
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
        <div className="flex gap-4">
          <label className="flex-1 space-y-0.5">
            <span className="label block">Fastest speed</span>
            <select
              value={fastest}
              onChange={(e) => setFastest(Number(e.target.value))}
              className={inputClass}
            >
              {FASTEST_SHUTTER_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  1/{f}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 space-y-0.5">
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
        <input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder="B, 1, 1/2, 1/4, 1/8, 1/15, 1/30, 1/60, 1/125, 1/250, 1/500, 1/1000"
          className={inputClass}
        />
      )}

      {mode === "generate" && (
        <p className="text-xs leading-snug text-muted">
          From 1s to 1/{fastest}, {STOP_INCREMENT_LABELS[increment].toLowerCase()}: {generatedValue}
        </p>
      )}

      {/* The field the server action actually reads — always in sync with whichever mode is active. */}
      <input type="hidden" name="shutter_speeds" value={value} />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setFrameExposureEvaluation } from "@/app/(app)/rolls/[id]/frames/actions";
import type { ExposureEvaluation } from "@/lib/database.types";

/**
 * Exposure evaluation as a three-position switch: Too Dark · Correct · Too
 * Bright, laid out on a real exposure axis (under → right → over), with the
 * "correct" position in the middle. Exactly one position is lit. Tapping the
 * lit position again clears it (back to "not evaluated") — one control, no
 * separate "unknown" state to hunt for. Saves on tap, optimistically.
 *
 * Fixed-height, equal-width cells: selecting never moves a neighbour.
 */
const POSITIONS: { value: ExposureEvaluation; label: string }[] = [
  { value: "Too Dark", label: "Dark" },
  { value: "Correct", label: "Correct" },
  { value: "Too Bright", label: "Bright" },
];

export function ExposureEvaluationSelect({
  rollId,
  frameId,
  initialValue,
}: {
  rollId: string;
  frameId: string;
  initialValue: ExposureEvaluation | null;
}) {
  const [value, setValue] = useState<ExposureEvaluation | null>(initialValue);
  const [, startTransition] = useTransition();

  function choose(next: ExposureEvaluation) {
    const target = value === next ? null : next;
    setValue(target);
    startTransition(async () => {
      const result = await setFrameExposureEvaluation(rollId, frameId, target);
      if (!result.ok) setValue(value);
    });
  }

  return (
    <div role="radiogroup" aria-label="Exposure evaluation" className="grid grid-cols-3 border-y border-border">
      {POSITIONS.map((p) => {
        const on = value === p.value;
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(p.value)}
            className={`relative flex h-12 items-center justify-center text-sm transition-colors ${
              on ? "text-accent" : "text-muted hover:text-muted-strong"
            }`}
          >
            {on && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-[2px] bg-accent" />}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setFrameExposureEvaluation } from "@/app/(app)/rolls/[id]/frames/actions";
import { EXPOSURE_EVALUATIONS, type ExposureEvaluation } from "@/lib/database.types";

export function ExposureEvaluationSelect({
  rollId,
  frameId,
  initialValue,
}: {
  rollId: string;
  frameId: string;
  initialValue: ExposureEvaluation | null;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = (e.target.value || null) as ExposureEvaluation | null;
        setValue(e.target.value);
        startTransition(async () => {
          await setFrameExposureEvaluation(rollId, frameId, next);
        });
      }}
      className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-50"
    >
      <option value="">Not evaluated</option>
      {EXPOSURE_EVALUATIONS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}

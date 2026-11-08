"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishRoll } from "@/app/(app)/active-roll/actions";
import { todayIsoDate } from "@/lib/date";

/**
 * Finish Roll from the roll page: records the closing date and marks the
 * roll completed. One deliberate step — choose the date, confirm — and no
 * requirements: frames, images and exposure data can all be missing.
 * The date defaults to today on this device, so it's the person's own
 * calendar day rather than the server's UTC one. Reopen undoes it.
 */
export function FinishRollControl({ rollId, startDate }: { rollId: string; startDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => {
    const today = todayIsoDate();
    return today < startDate ? startDate : today;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
      >
        Finish roll
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-muted">
        Closing date
        <input
          type="date"
          value={date}
          min={startDate}
          onChange={(e) => setDate(e.target.value)}
          className="field mt-1 block"
        />
      </label>
      <button
        type="button"
        disabled={pending || !date}
        onClick={() =>
          startTransition(async () => {
            const result = await finishRoll(rollId, date);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          })
        }
        className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black disabled:opacity-50"
      >
        {pending ? "Finishing…" : "Confirm"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="label h-10 hover:!text-foreground">
        Cancel
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}

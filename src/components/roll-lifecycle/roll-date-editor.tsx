"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRollDates } from "@/app/(app)/rolls/actions";

export function RollDateEditor({
  rollId,
  startDate,
  endDate,
}: {
  rollId: string;
  startDate: string;
  endDate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-accent hover:underline"
      >
        Edit dates
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-surface px-3 py-3">
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-muted">
          Start
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="text-xs text-muted">
          End
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await updateRollDates(rollId, start, end || null);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setEditing(false);
              setError(null);
              router.refresh();
            });
          }}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStart(startDate);
            setEnd(endDate ?? "");
            setError(null);
            setEditing(false);
          }}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

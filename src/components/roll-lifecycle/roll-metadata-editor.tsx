"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRollMetadata } from "@/app/(app)/rolls/actions";

export function RollMetadataEditor({
  rollId,
  startDate,
  endDate,
  customTitle,
  notes,
}: {
  rollId: string;
  startDate: string;
  endDate: string | null;
  customTitle: string | null;
  notes: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate ?? "");
  const [title, setTitle] = useState(customTitle ?? "");
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStart(startDate);
    setEnd(endDate ?? "");
    setTitle(customTitle ?? "");
    setNotesValue(notes ?? "");
    setError(null);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-accent hover:underline"
      >
        Edit roll details
      </button>
    );
  }

  const inputClass =
    "mt-1 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent";

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
      <label className="block text-xs text-muted">
        Custom title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Maddie, Cats, Kendrick, PMC"
          className={inputClass}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex-1 text-xs text-muted">
          Start date
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex-1 text-xs text-muted">
          End date
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block text-xs text-muted">
        Notes
        <textarea
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
          rows={2}
          className={inputClass}
        />
      </label>

      {error && <p className="text-xs text-fd-red">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await updateRollMetadata(rollId, {
                startDate: start,
                endDate: end || null,
                customTitle: title.trim() || null,
                notes: notesValue.trim() || null,
              });
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
            reset();
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

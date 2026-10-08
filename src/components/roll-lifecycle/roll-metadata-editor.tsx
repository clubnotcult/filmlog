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
    "field mt-1 block";

  return (
    <div className="space-y-4 border-y border-border py-4">
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

      {error && <p className="text-xs text-danger">{error}</p>}

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
          className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setEditing(false);
          }}
          className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

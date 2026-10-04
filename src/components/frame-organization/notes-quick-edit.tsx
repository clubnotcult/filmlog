"use client";

import { useState, useTransition } from "react";
import { setFrameNotes } from "@/app/(app)/rolls/[id]/frames/actions";

export function NotesQuickEdit({
  rollId,
  frameId,
  initialNotes,
}: {
  rollId: string;
  frameId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(initialNotes ?? "");
  const [, startTransition] = useTransition();

  function save() {
    if (value === saved) return;
    startTransition(async () => {
      const result = await setFrameNotes(rollId, frameId, value.trim() || null);
      if (result.ok) setSaved(value);
    });
  }

  return (
    <div>
      <span className="label">Notes</span>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder="—"
        className="field mt-1 resize-none"
      />
    </div>
  );
}

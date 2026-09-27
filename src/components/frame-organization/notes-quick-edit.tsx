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
  const [pending, startTransition] = useTransition();

  function save() {
    if (value === saved) return;
    startTransition(async () => {
      const result = await setFrameNotes(rollId, frameId, value.trim() || null);
      if (result.ok) setSaved(value);
    });
  }

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      rows={2}
      placeholder="Note…"
      disabled={pending}
      className="w-full resize-none rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
    />
  );
}

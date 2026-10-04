"use client";

import { useState, useTransition } from "react";
import { setFrameLocation } from "@/app/(app)/rolls/[id]/frames/actions";

/**
 * Follows the lens-inheritance model exactly, per spec — settable only on a
 * logged frame (an unlogged frame has no location, same as it has no lens),
 * so this only renders inside the metadata_logged branch of frame review.
 * Autocomplete via a plain <datalist> (no new dependency); typing a name
 * that doesn't exist yet creates it on save through get_or_create_location,
 * the same reuse-by-name path the Locations library page uses.
 */
export function LocationField({
  rollId,
  frameId,
  initialName,
  allLocationNames,
}: {
  rollId: string;
  frameId: string;
  initialName: string | null;
  allLocationNames: string[];
}) {
  const [value, setValue] = useState(initialName ?? "");
  const [saved, setSaved] = useState(initialName ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (value.trim() === (saved ?? "").trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await setFrameLocation(rollId, frameId, value.trim() || null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(value);
    });
  }

  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className="label">Location</span>
      <div className="text-right">
        <input
          list="location-suggestions"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="—"
          disabled={pending}
          className="w-40 border-0 bg-transparent text-right text-sm text-foreground outline-none placeholder:text-muted disabled:opacity-50"
        />
        <datalist id="location-suggestions">
          {allLocationNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {error && <p className="mt-0.5 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}

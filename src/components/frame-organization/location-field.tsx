"use client";

import { useState, useTransition } from "react";
import { setFrameLocation } from "@/app/(app)/rolls/[id]/frames/actions";

/**
 * The frame's own location — an explicit override of the roll's default.
 * When the frame has none, the roll's location shows as the placeholder
 * ("inherited"); typing a value overrides it for this frame only, and
 * clearing it goes back to inheriting. Works on logged and imported frames.
 * Autocomplete via a plain <datalist> (no new dependency); typing a name
 * that doesn't exist yet creates it on save through get_or_create_location,
 * the same reuse-by-name path the Locations library page uses.
 */
export function LocationField({
  rollId,
  frameId,
  initialName,
  inheritedName = null,
  allLocationNames,
}: {
  rollId: string;
  frameId: string;
  initialName: string | null;
  /** The roll's location, shown when this frame has no location of its own. */
  inheritedName?: string | null;
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
          placeholder={inheritedName ? `${inheritedName} · from roll` : "—"}
          disabled={pending}
          className="w-56 border-0 bg-transparent text-right text-sm text-foreground outline-none placeholder:text-muted disabled:opacity-50"
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

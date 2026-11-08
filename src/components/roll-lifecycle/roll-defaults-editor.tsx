"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TagChips } from "@/components/tag-chips";
import { addRollTag, removeRollTag, updateRollDefaults } from "@/app/(app)/rolls/actions";
import { pushDriveUpdates } from "@/components/roll-lifecycle/import-roll-panel";

/**
 * The roll's shared metadata: default lens, location and global tags. Every
 * frame inherits these unless it sets its own value. Edits here only touch
 * the roll — frame-level choices are never overwritten — and each change
 * refreshes the Drive descriptions of the roll's images in the background.
 */
export function RollDefaultsEditor({
  rollId,
  lenses,
  defaultLensId,
  locationName,
  tags: initialTags,
  allLocationNames,
  allTagNames,
}: {
  rollId: string;
  lenses: { id: string; name: string }[];
  defaultLensId: string | null;
  locationName: string | null;
  tags: { id: string; name: string }[];
  allLocationNames: string[];
  allTagNames: string[];
}) {
  const router = useRouter();
  const [lensId, setLensId] = useState(defaultLensId ?? "");
  const [location, setLocation] = useState(locationName ?? "");
  const [savedLocation, setSavedLocation] = useState(locationName ?? "");
  const [tags, setTags] = useState(initialTags);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveDefaults(nextLensId: string, nextLocation: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateRollDefaults(rollId, {
        defaultLensId: nextLensId || null,
        locationName: nextLocation.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedLocation(nextLocation);
      pushDriveUpdates(result.data.driveUpdates);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label block">Default lens</span>
          <select
            value={lensId}
            disabled={pending}
            onChange={(e) => {
              setLensId(e.target.value);
              saveDefaults(e.target.value, location);
            }}
            className="field mt-0.5 disabled:opacity-50"
          >
            <option value="">Unknown / not set</option>
            {lenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label block">Location</span>
          <input
            list="roll-default-location-suggestions"
            value={location}
            disabled={pending}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={() => location.trim() !== savedLocation.trim() && saveDefaults(lensId, location)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="—"
            autoComplete="off"
            className="field mt-0.5 disabled:opacity-50"
          />
          <datalist id="roll-default-location-suggestions">
            {allLocationNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
      </div>

      <div>
        <span className="label block">Tags · every image</span>
        <div className="mt-1.5">
          <TagChips
            tags={tags.map((t) => t.name)}
            disabled={pending}
            suggestions={allTagNames}
            listId="roll-tag-editor-suggestions"
            onAdd={(name) =>
              startTransition(async () => {
                setError(null);
                const result = await addRollTag(rollId, name);
                if (!result.ok) return setError(result.error);
                setTags((prev) => [...prev, result.data.tag]);
                pushDriveUpdates(result.data.driveUpdates);
                router.refresh();
              })
            }
            onRemove={(name) => {
              const tag = tags.find((t) => t.name === name);
              if (!tag) return;
              startTransition(async () => {
                setError(null);
                const result = await removeRollTag(rollId, tag.id);
                if (!result.ok) return setError(result.error);
                setTags((prev) => prev.filter((t) => t.id !== tag.id));
                pushDriveUpdates(result.data.driveUpdates);
                router.refresh();
              });
            }}
          />
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

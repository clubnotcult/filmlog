"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateLocation, renameLocation, deleteLocation } from "./actions";
import type { Location } from "@/lib/database.types";

export function LocationsManager({ initialLocations }: { initialLocations: Location[] }) {
  const router = useRouter();
  const [locations, setLocations] = useState(initialLocations);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await getOrCreateLocation(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewName("");
      if (!locations.some((l) => l.id === result.data.id)) {
        setLocations([...locations, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
  }

  function handleRename(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await renameLocation(id, name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLocations((prev) =>
        prev
          .map((l) => (l.id === id ? result.data : l))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Delete this location? Frames using it will simply show no location.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteLocation(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLocations((prev) => prev.filter((l) => l.id !== id));
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder="New location — e.g. Austin"
          className="field flex-1"
        />
        <button
          type="button"
          disabled={pending || !newName.trim()}
          onClick={handleCreate}
          className="label h-10 shrink-0 !text-accent disabled:!text-muted disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-4 border-t border-border">
        {locations.length === 0 && (
          <li className="py-4 text-sm text-muted">No locations yet.</li>
        )}
        {locations.map((loc) => (
          <li key={loc.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
            {editingId === loc.id ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRename(loc.id);
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                className="field flex-1"
              />
            ) : (
              <span className="text-sm text-foreground">{loc.name}</span>
            )}
            <div className="flex shrink-0 gap-4">
              {editingId === loc.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleRename(loc.id)}
                    className="label !text-accent"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="label hover:!text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(loc.id);
                      setEditingName(loc.name);
                    }}
                    className="label hover:!text-foreground"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(loc.id)}
                    className="label !text-danger/80 hover:!text-danger"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

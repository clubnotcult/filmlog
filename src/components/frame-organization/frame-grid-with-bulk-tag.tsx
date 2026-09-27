"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FrameCard } from "@/components/frame-card";
import { bulkTagFrames } from "@/app/(app)/rolls/[id]/frames/actions";
import { pushTagsToDrive } from "@/lib/google-drive";
import type { Frame } from "@/lib/database.types";

export function FrameGridWithBulkTag({
  rollId,
  frames,
  lensNameById,
  allTagNames,
}: {
  rollId: string;
  frames: Frame[];
  lensNameById: Map<string, string>;
  allTagNames: string[];
}) {
  const router = useRouter();
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function toggleSelect(frameId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(frameId)) next.delete(frameId);
      else next.add(frameId);
      return next;
    });
  }

  function handleApply() {
    const name = tagInput.trim();
    if (!name || selected.size === 0) return;
    setMessage(null);
    startTransition(async () => {
      const result = await bulkTagFrames(rollId, [...selected], name);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const { taggedCount, driveUpdates } = result.data;
      setMessage(`Tagged ${taggedCount} frame${taggedCount === 1 ? "" : "s"} with "${name}".`);
      // Best-effort, in the background — doesn't block the UI from resetting.
      void Promise.all(driveUpdates.map((u) => pushTagsToDrive(u.driveFileId, u.tags)));
      setTagInput("");
      setSelected(new Set());
      setBulkMode(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setBulkMode((v) => !v);
            setSelected(new Set());
            setMessage(null);
          }}
          className="text-xs text-accent hover:underline"
        >
          {bulkMode ? "Cancel selecting" : "Select frames to tag"}
        </button>
        {bulkMode && (
          <span className="text-xs text-muted">{selected.size} selected</span>
        )}
      </div>

      {bulkMode && (
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            list="bulk-tag-suggestions"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Tag name…"
            className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
          <datalist id="bulk-tag-suggestions">
            {allTagNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={pending || !tagInput.trim() || selected.size === 0}
            onClick={handleApply}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>
      )}

      {message && <p className="mb-3 text-xs text-muted-strong">{message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {frames.map((frame) => (
          <FrameCard
            key={frame.id}
            frame={frame}
            lensLabel={frame.lens_id ? (lensNameById.get(frame.lens_id) ?? null) : null}
            href={`/rolls/${rollId}/frames/${frame.id}`}
            selectable={bulkMode}
            selected={selected.has(frame.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </div>
  );
}

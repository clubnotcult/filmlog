"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FrameCard } from "@/components/frame-card";
import { bulkTagFrames } from "@/app/(app)/rolls/[id]/frames/actions";
import { pushTagsToDrive } from "@/lib/google-drive";
import type { Frame, Selection } from "@/lib/database.types";

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
  const [marks, setMarks] = useState<Selection[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // A roll is tens of frames, so filtering here is instant and needs no round
  // trip. Opening a frame from a filtered view carries the filter along (see
  // frame-nav), so Previous/Next walks just the marked frames.
  const visibleFrames =
    marks.length === 0
      ? frames
      : frames.filter((f) => f.selection !== null && marks.includes(f.selection));
  const contextQuery = marks.length > 0 ? `?sel=${marks.join(",")}` : "";

  function changeMarks(next: Selection[]) {
    setMarks(next);
    // Don't leave frames selected for tagging that the new filter has hidden.
    setSelected(new Set());
  }

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
      <div role="group" aria-label="Filter by mark" className="mb-2 flex items-center">
        <button
          type="button"
          onClick={() => changeMarks([])}
          aria-pressed={marks.length === 0}
          className={`label flex h-11 items-center pr-5 ${marks.length === 0 ? "!text-foreground" : "hover:!text-foreground"}`}
        >
          All
        </button>
        {(["heart", "star"] as const).map((mark) => {
          const on = marks.includes(mark);
          return (
            <button
              key={mark}
              type="button"
              onClick={() => changeMarks(on ? marks.filter((m) => m !== mark) : [...marks, mark])}
              aria-pressed={on}
              aria-label={mark === "heart" ? "Hearts" : "Stars"}
              className={`numeral flex h-11 w-11 items-center justify-center text-xl leading-none transition-colors ${
                on ? "text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {mark === "heart" ? (on ? "♥" : "♡") : on ? "★" : "☆"}
            </button>
          );
        })}
      </div>

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
          {bulkMode ? "Cancel" : "Tag several frames"}
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
            className="field flex-1"
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
            className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black disabled:opacity-40"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>
      )}

      {message && <p className="mb-3 text-xs text-muted-strong">{message}</p>}

      {visibleFrames.length === 0 && (
        <p className="py-6 text-sm text-muted">No frames in this roll have that mark yet.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {visibleFrames.map((frame) => (
          <FrameCard
            key={frame.id}
            frame={frame}
            lensLabel={frame.lens_id ? (lensNameById.get(frame.lens_id) ?? null) : null}
            href={`/rolls/${rollId}/frames/${frame.id}${contextQuery}`}
            selectable={bulkMode}
            selected={selected.has(frame.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </div>
  );
}

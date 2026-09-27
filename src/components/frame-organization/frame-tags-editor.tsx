"use client";

import { useState, useTransition } from "react";
import { addTagToFrame, removeTagFromFrame } from "@/app/(app)/rolls/[id]/frames/actions";
import { pushTagsToDrive } from "@/lib/google-drive";
import { combineTagsForDrive } from "@/lib/tags/system-tags";

export function FrameTagsEditor({
  rollId,
  frameId,
  driveFileId,
  systemTags,
  initialTags,
  allTagNames,
}: {
  rollId: string;
  frameId: string;
  /** When set, tag changes are also pushed (best-effort) into this Drive file's description, comma-separated — what Drive's own search actually matches against. */
  driveFileId: string | null;
  /** Derived from roll/gear metadata (format, film stock, camera, lens) — read-only here, never edited by hand. */
  systemTags: string[];
  initialTags: { id: string; name: string }[];
  allTagNames: string[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const name = input.trim();
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }
    setInput("");
    setError(null);
    startTransition(async () => {
      const result = await addTagToFrame(rollId, frameId, name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // We don't get the tag id back from a duplicate-tolerant insert path
      // cleanly here, so just refetch isn't necessary — show optimistically
      // with a temp id; a page reload will show the real one regardless.
      const nextTags = [...tags, { id: `temp-${result.data}`, name: result.data }];
      setTags(nextTags);
      void pushTagsToDrive(driveFileId, combineTagsForDrive(systemTags, nextTags.map((t) => t.name)));
    });
  }

  function handleRemove(tagId: string) {
    const nextTags = tags.filter((t) => t.id !== tagId);
    setTags(nextTags);
    void pushTagsToDrive(driveFileId, combineTagsForDrive(systemTags, nextTags.map((t) => t.name)));
    if (tagId.startsWith("temp-")) return; // optimistic add never persisted an id to remove by
    startTransition(async () => {
      await removeTagFromFrame(rollId, frameId, tagId);
    });
  }

  return (
    <div className="space-y-3">
      {systemTags.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted">System</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {systemTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/60 bg-transparent px-2.5 py-1 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        {tags.length > 0 && (
          <span className="text-[10px] uppercase tracking-wide text-muted">User</span>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-strong"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => handleRemove(tag.id)}
                aria-label={`Remove tag ${tag.name}`}
                className="text-muted hover:text-fd-red"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          list="tag-suggestions"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a tag…"
          disabled={pending}
          className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
        />
        <datalist id="tag-suggestions">
          {allTagNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !input.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-fd-red">{error}</p>}
    </div>
  );
}

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
    <div>
      {/* System tags: derived readings, so they're set as quiet type — no
          boxes, no remove control, nothing that suggests you can edit them. */}
      {systemTags.length > 0 && (
        <div>
          <span className="label">System</span>
          <p className="mt-1.5 text-sm leading-snug text-muted">
            {systemTags.join("  ·  ")}
          </p>
        </div>
      )}

      {/* User tags: the editable set. The row reserves one line of height
          even when empty, so the first tag doesn't push the layout down. */}
      <div className="mt-4">
        <span className="label">Tags</span>
        <div className="mt-1.5 flex min-h-9 flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex h-9 items-center gap-2 border border-border pl-3 pr-1 text-sm text-foreground"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => handleRemove(tag.id)}
                aria-label={`Remove tag ${tag.name}`}
                className="flex h-9 w-7 items-center justify-center text-muted hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="mt-1 flex items-center gap-3">
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
            enterKeyHint="done"
            autoCapitalize="words"
            autoComplete="off"
            placeholder="Add a tag"
            disabled={pending}
            className="field flex-1 disabled:opacity-50"
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
            className="label h-9 shrink-0 !text-accent disabled:!text-muted disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}

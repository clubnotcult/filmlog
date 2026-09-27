"use client";

import { useState, useTransition } from "react";
import { addTagToFrame, removeTagFromFrame } from "@/app/(app)/rolls/[id]/frames/actions";

export function FrameTagsEditor({
  rollId,
  frameId,
  initialTags,
  allTagNames,
}: {
  rollId: string;
  frameId: string;
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
      setTags((prev) => [...prev, { id: `temp-${result.data}`, name: result.data }]);
    });
  }

  function handleRemove(tagId: string) {
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    if (tagId.startsWith("temp-")) return; // optimistic add never persisted an id to remove by
    startTransition(async () => {
      await removeTagFromFrame(rollId, frameId, tagId);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
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

      <div className="mt-2 flex gap-2">
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
      {error && <p className="mt-1 text-xs text-fd-red">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";

/**
 * A row of removable tag chips plus an add field with autocomplete — the
 * same visual language as the frame tag editor. Controlled: the parent owns
 * the list and decides what add/remove means (local form state, or a server
 * action for a saved roll).
 */
export function TagChips({
  tags,
  onAdd,
  onRemove,
  suggestions,
  placeholder = "Add a tag",
  disabled = false,
  listId,
}: {
  tags: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  listId: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const name = input.trim();
    setInput("");
    if (!name || tags.some((t) => t.toLowerCase() === name.toLowerCase())) return;
    onAdd(name);
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex h-9 items-center gap-2 border border-border pl-3 pr-1 text-sm text-foreground">
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                disabled={disabled}
                aria-label={`Remove tag ${tag}`}
                className="flex h-9 w-7 items-center justify-center text-muted hover:text-danger disabled:opacity-40"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 flex items-center gap-3">
        <input
          type="text"
          list={listId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          enterKeyHint="done"
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          className="field flex-1 disabled:opacity-50"
        />
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={add}
          disabled={disabled || !input.trim()}
          className="label h-9 shrink-0 !text-accent disabled:!text-muted disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

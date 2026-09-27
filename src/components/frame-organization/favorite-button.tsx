"use client";

import { useState, useTransition } from "react";
import { setFrameFavorite } from "@/app/(app)/rolls/[id]/frames/actions";

/** Quick heart toggle — the action should be extremely fast, so this is optimistic: the heart flips immediately, then confirms with the server. */
export function FavoriteButton({
  rollId,
  frameId,
  initialFavorite,
}: {
  rollId: string;
  frameId: string;
  initialFavorite: boolean;
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const next = !favorite;
        setFavorite(next);
        startTransition(async () => {
          const result = await setFrameFavorite(rollId, frameId, next);
          if (!result.ok) setFavorite(!next);
        });
      }}
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorite}
      className={`flex h-10 w-10 items-center justify-center rounded-md border text-lg transition-colors ${
        favorite
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border text-muted hover:text-foreground"
      }`}
    >
      {favorite ? "★" : "☆"}
    </button>
  );
}

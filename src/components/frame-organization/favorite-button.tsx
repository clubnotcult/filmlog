"use client";

import { useState, useTransition } from "react";
import { setFrameFavorite } from "@/app/(app)/rolls/[id]/frames/actions";

/** One tap, optimistic. A glyph and a word — no box. Lit in the signal colour when on. */
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
      className={`flex h-12 items-center gap-2 transition-colors ${
        favorite ? "text-accent" : "text-muted hover:text-foreground"
      }`}
    >
      <span className="numeral text-xl leading-none">{favorite ? "★" : "☆"}</span>
      <span className="label !text-current">Favorite</span>
    </button>
  );
}

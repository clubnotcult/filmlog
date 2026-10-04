"use client";

import { useRef, useState } from "react";
import { setFrameSelection } from "@/app/(app)/rolls/[id]/frames/actions";
import type { Selection } from "@/lib/database.types";

/**
 * Heart and star as two direct-choice marks: tap ♡ for a heart, tap ☆ for a
 * star, tap the lit one again to clear it. Choosing directly (rather than
 * cycling none → heart → star) means a star is one tap from anywhere, which
 * is what matters when promoting the strongest frames in a rapid pass.
 * Mutually exclusive: tapping the other mark moves the selection to it.
 *
 * Built for tap-then-Next: the mark flips instantly (optimistic) and the
 * controls never lock while a save is in flight, so a second tap or an
 * immediate Next never waits on the network. Saves are issued in tap order,
 * so the last tap wins. If a save fails, the mark returns to the last value
 * the server actually confirmed rather than pretending it stuck. The label
 * is deliberately absent: the glyphs carry the meaning.
 */
export function SelectionControl({
  rollId,
  frameId,
  initialSelection,
}: {
  rollId: string;
  frameId: string;
  initialSelection: Selection | null;
}) {
  const [selection, setSelection] = useState<Selection | null>(initialSelection);
  const confirmed = useRef<Selection | null>(initialSelection);

  function choose(mark: Selection) {
    const next = selection === mark ? null : mark;
    setSelection(next);
    void setFrameSelection(rollId, frameId, next).then((result) => {
      if (result.ok) confirmed.current = result.data;
      else setSelection(confirmed.current);
    });
  }

  const base =
    "numeral flex h-12 w-12 items-center justify-center text-2xl leading-none transition-colors";

  return (
    <div role="group" aria-label="Mark this photograph" className="flex items-center">
      <button
        type="button"
        onClick={() => choose("heart")}
        aria-label={selection === "heart" ? "Clear heart" : "Mark with a heart"}
        aria-pressed={selection === "heart"}
        className={`${base} ${selection === "heart" ? "text-accent" : "text-muted hover:text-foreground"}`}
      >
        {selection === "heart" ? "♥" : "♡"}
      </button>
      <button
        type="button"
        onClick={() => choose("star")}
        aria-label={selection === "star" ? "Clear star" : "Mark with a star"}
        aria-pressed={selection === "star"}
        className={`${base} ${selection === "star" ? "text-accent" : "text-muted hover:text-foreground"}`}
      >
        {selection === "star" ? "★" : "☆"}
      </button>
    </div>
  );
}

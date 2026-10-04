"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { insertFrame } from "@/app/(app)/rolls/[id]/frames/actions";

/**
 * For the "a shot got missed while shooting" case: the logged sequence is
 * off by one from here on, and every synced photo after this point is
 * attached to the wrong metadata. Insertion fixes the numbering; it doesn't
 * try to guess which Drive file the missed shot actually is — that's what
 * re-syncing the roll afterward is for (natural filename order will realign
 * every frame, now that the numbers are correct).
 */
export function InsertFrameControls({
  rollId,
  frameNumber,
}: {
  rollId: string;
  frameNumber: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"before" | "after" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInsert(position: "before" | "after") {
    const label =
      position === "before" ? `before Frame ${frameNumber}` : `after Frame ${frameNumber}`;
    if (
      !window.confirm(
        `Insert a new frame ${label}? Frame numbers from there on will shift up by one. Re-sync this roll afterward so photos realign.`,
      )
    ) {
      return;
    }
    setPending(position);
    setError(null);
    const afterFrameNumber = position === "before" ? frameNumber - 1 : frameNumber;
    const result = await insertFrame(rollId, afterFrameNumber);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/rolls/${rollId}/frames/${result.data.id}`);
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => handleInsert("before")}
          className="label hover:!text-foreground disabled:opacity-50"
        >
          Insert Before
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => handleInsert("after")}
          className="label hover:!text-foreground disabled:opacity-50"
        >
          Insert After
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

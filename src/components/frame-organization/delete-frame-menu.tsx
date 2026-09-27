"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteFrame } from "@/app/(app)/rolls/[id]/frames/actions";

type Step = "closed" | "confirm1" | "confirm2";

/**
 * Deleting a historical frame is more protected than removing the newest
 * frame (RemoveLastFrameButton): two confirmations instead of one, and the
 * second step explains exactly what happens — the frame_number is not
 * reused, so this leaves a permanent gap rather than silently renumbering
 * everything after it (see the Phase 9 migration for why).
 */
export function DeleteFrameMenu({
  rollId,
  frameId,
  frameNumber,
  hasSyncedImage,
}: {
  rollId: string;
  frameId: string;
  frameNumber: number;
  hasSyncedImage: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setStep("closed");
    setError(null);
  }

  async function handleDelete() {
    setSubmitting(true);
    const result = await deleteFrame(rollId, frameId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/rolls/${rollId}`);
  }

  if (step === "closed") {
    return (
      <button
        type="button"
        onClick={() => setStep("confirm1")}
        className="text-xs text-fd-red/80 hover:text-fd-red"
      >
        Delete this frame
      </button>
    );
  }

  return (
    <div className="rounded-md border border-fd-red/40 bg-surface px-4 py-3">
      {step === "confirm1" && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">Delete Frame {frameNumber}?</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setStep("confirm2")}
              className="rounded-md border border-fd-red/50 px-3 py-1.5 text-xs text-fd-red hover:bg-fd-red/10"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "confirm2" && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            This removes Frame {frameNumber}&apos;s record permanently. Frame
            numbers after it will not be renumbered — {frameNumber} will
            simply be missing from the sequence. This cannot be undone.
          </p>
          {hasSyncedImage && (
            <p className="text-xs text-muted">
              This frame has a synced photo association; the association is
              removed, but the actual file in Google Drive is never touched.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleDelete}
              className="rounded-md bg-fd-red px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
            >
              {submitting ? "Deleting…" : "Delete Permanently"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-fd-red">{error}</p>}
    </div>
  );
}

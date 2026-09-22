"use client";

import { useState } from "react";

type Step = "closed" | "menu" | "confirm1" | "confirm2" | "pending-choice";

/**
 * Tucked-away "Finish Roll" action (spec: must NOT be near NEXT FRAME, must
 * require two separate confirmations). If the current shooting screen has a
 * valid, savable-but-unsaved frame (shutter + aperture both chosen), the
 * final step makes that explicit instead of silently discarding it — the
 * user must choose to save it first or knowingly finish without it.
 */
export function FinishRollMenu({
  frameNumber,
  hasPendingSelection,
  onFinish,
  onSaveAndFinish,
}: {
  frameNumber: number;
  hasPendingSelection: boolean;
  onFinish: () => Promise<{ ok: boolean; error?: string }>;
  onSaveAndFinish: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [step, setStep] = useState<Step>("closed");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setStep("closed");
    setError(null);
  }

  async function handleConfirmed() {
    if (hasPendingSelection) {
      setStep("pending-choice");
      return;
    }
    setSubmitting(true);
    const result = await onFinish();
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't finish the roll.");
      return;
    }
    close();
  }

  async function handleSaveAndFinish() {
    setSubmitting(true);
    const result = await onSaveAndFinish();
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save and finish.");
      return;
    }
    close();
  }

  async function handleFinishWithoutSaving() {
    setSubmitting(true);
    const result = await onFinish();
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't finish the roll.");
      return;
    }
    close();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setStep(step === "closed" ? "menu" : "closed")}
        aria-label="Roll menu"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-strong hover:text-foreground"
      >
        ⋯
      </button>

      {step !== "closed" && (
        <div className="absolute right-0 top-11 z-20 w-72 max-w-[calc(100vw-2.5rem)] rounded-md border border-border bg-surface-raised p-4 shadow-lg">
          {step === "menu" && (
            <button
              type="button"
              onClick={() => setStep("confirm1")}
              className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-foreground hover:border-fd-red hover:text-fd-red"
            >
              Finish Roll
            </button>
          )}

          {step === "confirm1" && (
            <div className="space-y-3">
              <p className="text-sm text-foreground">Finish Roll?</p>
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
                Are you sure? This will mark the roll as complete.
              </p>
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
                  onClick={handleConfirmed}
                  className="rounded-md bg-fd-red px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
                >
                  {submitting ? "Finishing…" : "Finish Roll"}
                </button>
              </div>
            </div>
          )}

          {step === "pending-choice" && (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Frame {frameNumber} hasn&apos;t been saved yet.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSaveAndFinish}
                  className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-black disabled:opacity-50"
                >
                  {submitting ? "Saving…" : `Save Frame ${frameNumber} and Finish`}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleFinishWithoutSaving}
                  className="rounded-md border border-fd-red/50 px-3 py-2 text-xs text-fd-red hover:bg-fd-red/10 disabled:opacity-50"
                >
                  Finish Without Saving Frame {frameNumber}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border border-border px-3 py-2 text-xs text-muted-strong hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-fd-red">{error}</p>}
        </div>
      )}
    </div>
  );
}

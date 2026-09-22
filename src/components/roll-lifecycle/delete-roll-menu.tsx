"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRoll } from "@/app/(app)/rolls/actions";

type Step = "closed" | "confirm1" | "confirm2" | "type-delete";

/**
 * Permanent roll deletion. Intentionally lives only on the roll detail page
 * (never imported into the Active Roll shooting screen) and requires three
 * distinct gates: two plain confirmations, then typing the literal word
 * DELETE — checked again server-side in the deleteRoll action itself, not
 * just here.
 */
export function DeleteRollMenu({
  rollId,
  frameCount,
}: {
  rollId: string;
  frameCount: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setStep("closed");
    setConfirmText("");
    setError(null);
  }

  async function handleDelete() {
    setSubmitting(true);
    const result = await deleteRoll(rollId, confirmText);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/rolls");
  }

  if (step === "closed") {
    return (
      <button
        type="button"
        onClick={() => setStep("confirm1")}
        className="text-xs text-fd-red/80 hover:text-fd-red"
      >
        Delete this roll permanently
      </button>
    );
  }

  return (
    <div className="rounded-md border border-fd-red/40 bg-surface px-4 py-3">
      {step === "confirm1" && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">Delete this roll?</p>
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
            This will permanently delete this roll&apos;s metadata,{" "}
            {frameCount === 1 ? "its 1 frame record" : `all ${frameCount} frame records`}{" "}
            (exposure metadata, notes, and Drive image associations). This cannot be undone.
          </p>
          <p className="text-xs text-muted">
            Your actual photos in Google Drive are never touched — only this
            app&apos;s own records are deleted.
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
              onClick={() => setStep("type-delete")}
              className="rounded-md border border-fd-red/50 px-3 py-1.5 text-xs text-fd-red hover:bg-fd-red/10"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "type-delete" && (
        <div className="space-y-3">
          <label htmlFor="delete-confirm" className="block text-sm text-foreground">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm.
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-fd-red"
          />
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
              disabled={confirmText !== "DELETE" || submitting}
              onClick={handleDelete}
              className="rounded-md bg-fd-red px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40"
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

"use client";

import { useState, useTransition } from "react";

export type RowActionState = { error: string | null };
export type RowAction = () => Promise<RowActionState>;

/** A "Delete" button that confirms first and surfaces DB errors inline. */
export function ConfirmDeleteButton({
  action,
  itemLabel,
}: {
  action: RowAction;
  itemLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete ${itemLabel}? This can't be undone.`)) {
            return;
          }
          startTransition(async () => {
            const result = await action();
            setError(result.error);
          });
        }}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-strong hover:border-red-400 hover:text-red-400 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="max-w-48 text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** An "Activate"/"Deactivate" toggle button. */
export function ToggleActiveButton({
  action,
  active,
}: {
  action: RowAction;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await action();
            setError(result.error);
          });
        }}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-strong hover:text-foreground disabled:opacity-50"
      >
        {pending ? "…" : active ? "Deactivate" : "Activate"}
      </button>
      {error && <p className="max-w-48 text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** A small "-"/"+" stepper used for inventory quantity adjustments. */
export function QuantityStepper({
  quantity,
  onDecrement,
  onIncrement,
}: {
  quantity: number;
  onDecrement: RowAction;
  onIncrement: RowAction;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: RowAction) {
    startTransition(async () => {
      const result = await action();
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || quantity <= 0}
          onClick={() => run(onDecrement)}
          aria-label="Decrease quantity"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-strong hover:text-foreground disabled:opacity-30"
        >
          −
        </button>
        <span className="w-6 text-center font-mono text-sm text-foreground">
          {quantity}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(onIncrement)}
          aria-label="Increase quantity"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-strong hover:text-foreground disabled:opacity-50"
        >
          +
        </button>
      </div>
      {error && <p className="max-w-48 text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}

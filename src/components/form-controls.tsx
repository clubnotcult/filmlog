"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-xs text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingChildren,
  disabled,
}: {
  children: ReactNode;
  pendingChildren?: ReactNode;
  /** Disables the button regardless of pending state, e.g. when a prerequisite is missing. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity disabled:opacity-50"
    >
      {pending ? (pendingChildren ?? "Saving…") : children}
    </button>
  );
}

export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <p className="text-sm text-fd-red">{error}</p>;
}

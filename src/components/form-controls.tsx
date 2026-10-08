"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export const inputClass =
  "field";

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
    <div className="space-y-0.5">
      <label htmlFor={htmlFor} className="label block">
        {label}
      </label>
      {children}
      {hint && <p className="pt-1 text-xs leading-snug text-muted">{hint}</p>}
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
      className="numeral flex h-11 items-center bg-accent px-6 text-sm font-medium uppercase tracking-[0.14em] text-black transition-opacity disabled:opacity-40"
    >
      {pending ? (pendingChildren ?? "Saving…") : children}
    </button>
  );
}

export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <p className="text-sm text-danger">{error}</p>;
}

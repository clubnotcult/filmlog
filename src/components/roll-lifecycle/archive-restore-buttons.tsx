"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveRoll, restoreRoll } from "@/app/(app)/rolls/actions";

function LifecycleButton({
  label,
  pendingLabel,
  action,
}: {
  label: string;
  pendingLabel: string;
  action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await action();
            if (!result.ok) {
              setError(result.error ?? "Something went wrong.");
              return;
            }
            router.refresh();
          });
        }}
        className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50"
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function ArchiveRollButton({ rollId }: { rollId: string }) {
  return (
    <LifecycleButton
      label="Archive roll"
      pendingLabel="Archiving…"
      action={() => archiveRoll(rollId)}
    />
  );
}

export function RestoreRollButton({ rollId }: { rollId: string }) {
  return (
    <LifecycleButton
      label="Restore roll"
      pendingLabel="Restoring…"
      action={() => restoreRoll(rollId)}
    />
  );
}

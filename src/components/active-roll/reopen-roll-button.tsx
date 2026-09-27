"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenRoll } from "@/app/(app)/active-roll/actions";

export function ReopenRollButton({ rollId }: { rollId: string }) {
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
            const result = await reopenRoll(rollId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/active-roll/${rollId}`);
          });
        }}
        className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-50"
      >
        {pending ? "Reopening…" : "Reopen roll"}
      </button>
      {error && <p className="mt-1 text-xs text-fd-red">{error}</p>}
    </div>
  );
}

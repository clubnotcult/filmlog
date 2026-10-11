"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A frame page that failed to LOAD (as opposed to not existing): retry in place, or return to the roll. */
export default function FrameError({ reset }: { error: Error; reset: () => void }) {
  const rollId = usePathname().match(/^\/rolls\/([^/]+)\/frames\//)?.[1] ?? null;
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-lg text-foreground">Couldn&apos;t load this photo</h1>
      <p className="mt-2 text-sm text-muted">
        This is usually a brief connection problem. Nothing was lost; your marks are saved.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="numeral inline-flex h-10 items-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
        >
          Try again
        </button>
        <Link
          href={rollId ? `/rolls/${rollId}` : "/rolls"}
          className="label inline-flex h-10 items-center border border-border px-4 !text-muted-strong hover:!text-foreground"
        >
          Back to roll
        </Link>
      </div>
    </div>
  );
}

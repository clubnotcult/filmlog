"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Shown when a frame genuinely isn't there (deleted, or a stale link). Instead
 * of a dead end it leads back into the review: the roll it was opened from, or
 * Explore with the same filters when that is where the person was.
 */
export default function FrameNotFound() {
  const pathname = usePathname();
  const params = useSearchParams();
  const rollId = pathname.match(/^\/rolls\/([^/]+)\/frames\//)?.[1] ?? null;

  const fromExplore = params.get("ctx") === "explore";
  const exploreParams = new URLSearchParams(params.toString());
  exploreParams.delete("ctx");
  const exploreQs = exploreParams.toString();

  const sel = params.get("sel");
  const rollHref = rollId ? `/rolls/${rollId}` : "/rolls";

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-lg text-foreground">That photo isn&apos;t available</h1>
      <p className="mt-2 text-sm text-muted">
        It may have been deleted, or the link is out of date. Your marks are saved; pick up where
        you left off:
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {fromExplore ? (
          <Link
            href={exploreQs ? `/explore?${exploreQs}` : "/explore"}
            className="numeral inline-flex h-10 items-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
          >
            Back to Explore
          </Link>
        ) : (
          <Link
            href={rollHref}
            className="numeral inline-flex h-10 items-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
          >
            Back to roll{sel ? " (marked photos)" : ""}
          </Link>
        )}
        <Link
          href="/rolls"
          className="label inline-flex h-10 items-center border border-border px-4 !text-muted-strong hover:!text-foreground"
        >
          Library
        </Link>
      </div>
    </div>
  );
}

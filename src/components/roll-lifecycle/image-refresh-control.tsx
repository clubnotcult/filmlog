"use client";

import { useEffect } from "react";
import Link from "next/link";
import { preloadDriveAuth } from "@/lib/google-drive/auth";
import { describeIssueKind, describeStage } from "@/lib/google-drive/describe-stage";
import { useImageHealth } from "@/lib/google-drive/image-health";
import { useAutoImageRepair, type AutoRepairRoll } from "./use-auto-image-repair";
import { useDriveRefresh } from "./use-drive-refresh";

const TONE = { muted: "text-muted", accent: "text-accent", danger: "text-danger" } as const;

/**
 * The All Images refresh. Two things happen here:
 *
 * - AUTOMATIC (no tap): when thumbnails on this page fail to load, the rolls
 *   they belong to are repaired quietly, if Google access is available
 *   without a window (see useAutoImageRepair).
 * - EXPLICIT (a tap): "Refresh images" refreshes every roll with a Drive
 *   folder, and is also the "Reconnect Google" button when access is needed.
 *   A tap is required for that case because only a tap lets the browser open
 *   Google's sign-in window.
 *
 * The line of text always says what is actually happening — waiting on
 * Google, reading rolls, refreshing N / M, updating the library — or what
 * went wrong and what to do about it. It is never a bare spinner.
 */
export function ImageRefreshControl({ pageRolls }: { pageRolls: AutoRepairRoll[] }) {
  const { stage, start, isUpdating } = useDriveRefresh();
  const { failedCount, authNeeded } = useImageHealth();
  useAutoImageRepair(pageRolls);

  // Load Google's script now so a later tap can open the sign-in window in
  // the same instant, which is what browsers require.
  useEffect(() => {
    preloadDriveAuth();
  }, []);

  const view = describeStage(stage, { isUpdating, authNeeded, failedCount });
  const issues = stage.kind === "done" ? stage.issues : [];
  const prominent = view.action === "Reconnect Google";

  return (
    <div className="min-h-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span role="status" aria-live="polite" className={`font-mono text-[11px] ${TONE[view.tone]}`}>
          {view.text ?? ""}
        </span>
        {view.action && (
          <button
            type="button"
            onClick={() => start({ kind: "all" })}
            className={`label shrink-0 py-1 ${prominent ? "!text-accent" : "hover:!text-foreground"}`}
          >
            {view.action}
          </button>
        )}
      </div>

      {issues.length > 0 && (
        <details className="mt-2">
          <summary className="label cursor-pointer select-none">Show what needs attention</summary>
          <ul className="mt-2 space-y-1.5">
            {issues.map((issue, i) => (
              <li key={`${issue.rollId}-${i}`} className="text-xs text-muted">
                <Link href={`/rolls/${issue.rollId}`} className="text-foreground underline-offset-2 hover:underline">
                  {issue.rollTitle}
                </Link>{" "}
                — {describeIssueKind(issue.kind)}
                {issue.kind === "missing_files" || issue.kind === "failed" ? ` (${issue.detail})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

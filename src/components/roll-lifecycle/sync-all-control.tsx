"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDriveAccessToken } from "@/lib/google-drive/auth";
import { refreshManyRolls, type RollImageRefreshResult } from "@/lib/google-drive/refresh-service";
import { listRollsForSync } from "@/app/(app)/rolls/[id]/sync/actions";

type Stage = "idle" | "loading" | "syncing" | "done" | "error";

/**
 * Reuses refreshManyRolls (which itself reuses the exact same per-roll
 * refresh logic the silent background refresh and the single-roll button
 * use) across every roll with a remembered Drive folder — one access token,
 * obtained once, bounded concurrency rather than firing every roll's
 * request at once. A roll failing (expired access, a deleted Drive folder,
 * anything) doesn't stop the rest; failures are collected and named at the
 * end rather than silently dropped or aborting the whole batch.
 */
export function SyncAllControl() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<(RollImageRefreshResult & { rollTitle: string })[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSyncAll() {
    setStage("loading");
    setError(null);
    setResults([]);

    const rolls = await listRollsForSync();
    if (rolls.length === 0) {
      setError("No rolls with a synced Drive folder yet.");
      setStage("error");
      return;
    }

    let token: string;
    try {
      token = await getDriveAccessToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect to Google Drive.");
      setStage("error");
      return;
    }

    setStage("syncing");
    setProgress({ completed: 0, total: rolls.length });

    const titleByRollId = new Map(rolls.map((r) => [r.rollId, r.rollTitle]));
    const rawResults = await refreshManyRolls(
      token,
      rolls.map((r) => ({ rollId: r.rollId, driveFolderId: r.driveFolderId, frames: r.frames })),
      {
        concurrency: 4,
        onProgress: (completed, total) => setProgress({ completed, total }),
      },
    );

    setResults(
      rawResults.map((r) => ({ ...r, rollTitle: titleByRollId.get(r.rollId) ?? "Untitled roll" })),
    );
    setStage("done");
    router.refresh();
  }

  const failedResults = results.filter((r) => !r.ok);

  if (stage === "idle") {
    return (
      <button type="button" onClick={handleSyncAll} className="label hover:!text-foreground">
        Sync All
      </button>
    );
  }

  if (stage === "loading") {
    return <span className="label">Preparing…</span>;
  }

  if (stage === "syncing") {
    return (
      <span className="numeral label !normal-case !tracking-normal">
        Syncing… {progress.completed} / {progress.total}
      </span>
    );
  }

  if (stage === "error") {
    return (
      <div>
        <span className="label !text-danger">{error}</span>
      </div>
    );
  }

  // done
  const succeededCount = results.length - failedResults.length;
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="label !text-accent">
          {succeededCount} roll{succeededCount === 1 ? "" : "s"} updated
        </span>
        {failedResults.length > 0 && (
          <span className="label !text-danger">
            {failedResults.length} need{failedResults.length === 1 ? "s" : ""} attention
          </span>
        )}
        <button type="button" onClick={handleSyncAll} className="label hover:!text-foreground">
          Sync All
        </button>
      </div>
      {failedResults.length > 0 && (
        <ul className="mt-2 space-y-1">
          {failedResults.map((r) => (
            <li key={r.rollId} className="text-xs text-muted">
              <span className="text-danger">{r.rollTitle}</span> — {r.ok ? "" : r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { getDriveAccessToken } from "@/lib/google-drive/auth";
import { setAuthNeeded } from "@/lib/google-drive/image-health";
import { refreshManyRolls } from "@/lib/google-drive/refresh-service";
import { runRefresh, type RefreshSource, type RefreshStage } from "@/lib/google-drive/refresh-run";
import { listRollsForSync } from "@/app/(app)/rolls/[id]/sync/actions";
import { useRefreshPage } from "./use-refresh-page";

/**
 * The explicit, tap-driven refresh — one roll or every roll — as React state.
 * `start` must be called directly from a click handler: it asks Google for
 * access synchronously (see runRefresh for why that matters), so nothing may
 * be awaited before calling it.
 */
export function useDriveRefresh() {
  const [stage, setStage] = useState<RefreshStage>({ kind: "idle" });
  const { isUpdating, refreshPage } = useRefreshPage();
  const running = useRef(false);

  const start = useCallback(
    (source: RefreshSource) => {
      if (running.current) return; // a second tap while one is running is ignored
      running.current = true;

      void runRefresh(
        source,
        { getToken: getDriveAccessToken, listRolls: listRollsForSync, refreshMany: refreshManyRolls },
        setStage,
      )
        .then((final) => {
          setAuthNeeded(final.kind === "needs_auth");
          const changedSomething =
            final.kind === "done" || (final.kind === "needs_auth" && final.updatedRolls > 0);
          if (changedSomething) refreshPage();
        })
        .finally(() => {
          running.current = false;
        });
    },
    [refreshPage],
  );

  return { stage, start, isUpdating };
}

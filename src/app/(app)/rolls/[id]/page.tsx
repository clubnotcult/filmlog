import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateRollTitle } from "@/lib/roll-title";
import { formatLongDate } from "@/lib/date";
import { formatPush } from "@/lib/exposure-format";
import { computeSyncStatus, syncStatusLabel } from "@/lib/sync-status";
import { ReopenRollButton } from "@/components/active-roll/reopen-roll-button";
import { ArchiveRollButton, RestoreRollButton } from "@/components/roll-lifecycle/archive-restore-buttons";
import { DeleteRollMenu } from "@/components/roll-lifecycle/delete-roll-menu";
import { SyncPhotosPanel } from "@/components/roll-lifecycle/sync-photos-panel";
import { RollDateEditor } from "@/components/roll-lifecycle/roll-date-editor";
import { FrameCard } from "@/components/frame-card";

export default async function RollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: roll } = await supabase
    .from("rolls")
    .select("*")
    .eq("id", id)
    .single();

  if (!roll) notFound();

  const [{ data: filmStock }, { data: camera }, { data: defaultLens }, { data: frames }, { data: allLenses }, { data: latestSync }] =
    await Promise.all([
      supabase.from("film_stocks").select("name").eq("id", roll.film_stock_id).single(),
      supabase.from("cameras").select("name").eq("id", roll.camera_id).single(),
      supabase.from("lenses").select("name").eq("id", roll.default_lens_id).single(),
      supabase
        .from("frames")
        .select("*")
        .eq("roll_id", roll.id)
        .order("frame_number", { ascending: true }),
      // All lenses, not just active — a historical frame may reference a
      // lens that's since been deactivated, and its name still needs to show.
      supabase.from("lenses").select("id, name"),
      supabase
        .from("roll_sync_history")
        .select("*")
        .eq("roll_id", roll.id)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const title = generateRollTitle({
    startDate: roll.start_date,
    endDate: roll.end_date,
    filmStockName: filmStock?.name ?? "Unknown film",
    customTitle: roll.custom_title,
  });

  const lensNameById = new Map((allLenses ?? []).map((l) => [l.id, l.name]));
  const frameList = frames ?? [];
  const syncStatus = computeSyncStatus(frameList);

  // --- Statistics -----------------------------------------------------
  const totalFrames = frameList.length;
  const loggedFrames = frameList.filter((f) => f.metadata_logged);
  const unloggedCount = totalFrames - loggedFrames.length;

  const lensesUsed = Array.from(
    new Set(
      loggedFrames
        .map((f) => (f.lens_id ? lensNameById.get(f.lens_id) : null))
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort();

  const pushPullCounts = new Map<number, number>();
  for (const f of loggedFrames) {
    const value = f.push_pull ?? 0;
    pushPullCounts.set(value, (pushPullCounts.get(value) ?? 0) + 1);
  }
  const pushPullSummary = Array.from(pushPullCounts.entries())
    .sort(([a], [b]) => a - b)
    .map(([value, count]) => `${formatPush(value)} (${count})`)
    .join(" · ");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/rolls" className="text-xs text-muted hover:text-foreground">
        ← Rolls
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="min-w-0 break-words font-mono text-lg text-foreground">{title}</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            roll.status === "active"
              ? "bg-accent/20 text-accent"
              : roll.status === "archived"
                ? "border border-border text-muted opacity-70"
                : "border border-border text-muted"
          }`}
        >
          {roll.status}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-md border border-border px-4 py-4 text-sm">
        <div>
          <dt className="text-xs text-muted">Film stock</dt>
          <dd className="mt-0.5 text-foreground">{filmStock?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Camera</dt>
          <dd className="mt-0.5 text-foreground">{camera?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Default lens</dt>
          <dd className="mt-0.5 text-foreground">{defaultLens?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Frame count</dt>
          <dd className="mt-0.5 font-mono text-foreground">{totalFrames}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Start date</dt>
          <dd className="mt-0.5 text-foreground">
            {formatLongDate(roll.start_date)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">End date</dt>
          <dd className="mt-0.5 text-foreground">
            {roll.end_date ? formatLongDate(roll.end_date) : "—"}
          </dd>
        </div>
        {roll.status !== "active" && (
          <div className="col-span-2">
            <RollDateEditor
              rollId={roll.id}
              startDate={roll.start_date}
              endDate={roll.end_date}
            />
          </div>
        )}
        {roll.custom_title && (
          <div className="col-span-2">
            <dt className="text-xs text-muted">Custom title</dt>
            <dd className="mt-0.5 text-foreground">{roll.custom_title}</dd>
          </div>
        )}
        {roll.notes && (
          <div className="col-span-2">
            <dt className="text-xs text-muted">Notes</dt>
            <dd className="mt-0.5 text-foreground">{roll.notes}</dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-xs text-muted">Google Drive photos</dt>
          <dd className="mt-0.5 text-muted-strong">
            {syncStatusLabel(syncStatus)}
            {latestSync && (
              <span className="text-xs text-muted">
                {" "}
                · last synced {formatLongDate(latestSync.synced_at.slice(0, 10))} to &ldquo;
                {latestSync.drive_folder_name ?? "folder"}&rdquo; ({latestSync.image_count} images
                {latestSync.status === "completed_with_mismatch" ? ", count mismatch" : ""})
              </span>
            )}
          </dd>
        </div>
      </dl>

      {totalFrames > 0 && (
        <div className="mt-6 rounded-md border border-border px-4 py-4">
          <h2 className="font-mono text-sm tracking-wide text-foreground">
            STATISTICS
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Total frames</dt>
              <dd className="mt-0.5 font-mono text-foreground">{totalFrames}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Logged</dt>
              <dd className="mt-0.5 font-mono text-foreground">{loggedFrames.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Unlogged</dt>
              <dd className="mt-0.5 font-mono text-foreground">{unloggedCount}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-muted">Lenses used</dt>
              <dd className="mt-0.5 text-foreground">
                {lensesUsed.length > 0 ? lensesUsed.join(", ") : "—"}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <dt className="text-xs text-muted">Push/pull</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {pushPullSummary || "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-6 rounded-md border border-border px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-sm tracking-wide text-foreground">
            FRAMES
          </h2>
          <div className="flex items-center gap-2">
            <SyncPhotosPanel
              rollId={roll.id}
              frames={frameList.map((f) => ({ id: f.id, frame_number: f.frame_number }))}
            />
            {roll.status === "active" ? (
              <Link
                href={`/active-roll/${roll.id}`}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black"
              >
                Continue shooting
              </Link>
            ) : roll.status === "completed" ? (
              <div className="flex gap-2">
                <ReopenRollButton rollId={roll.id} />
                <ArchiveRollButton rollId={roll.id} />
              </div>
            ) : (
              <RestoreRollButton rollId={roll.id} />
            )}
          </div>
        </div>

        {totalFrames === 0 ? (
          <p className="mt-3 text-sm text-muted">No frames logged yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {frameList.map((frame) => (
              <FrameCard
                key={frame.id}
                frame={frame}
                lensLabel={frame.lens_id ? (lensNameById.get(frame.lens_id) ?? null) : null}
                href={`/rolls/${roll.id}/frames/${frame.id}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <DeleteRollMenu rollId={roll.id} frameCount={totalFrames} />
      </div>
    </div>
  );
}

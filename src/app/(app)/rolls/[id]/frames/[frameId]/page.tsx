import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatAperture, formatPush } from "@/lib/exposure-format";
import { formatLongDate } from "@/lib/date";

export default async function FrameDetailPage({
  params,
}: {
  params: Promise<{ id: string; frameId: string }>;
}) {
  const { id: rollId, frameId } = await params;
  const supabase = await createClient();

  const { data: frame } = await supabase
    .from("frames")
    .select("*")
    .eq("id", frameId)
    .eq("roll_id", rollId)
    .single();

  if (!frame) notFound();

  const { data: lens } = frame.lens_id
    ? await supabase.from("lenses").select("name").eq("id", frame.lens_id).single()
    : { data: null };

  return (
    <div className="mx-auto max-w-md">
      <Link
        href={`/rolls/${rollId}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← Roll
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="font-mono text-2xl text-foreground">
          Frame {frame.frame_number}
        </h1>
        <Link
          href={`/rolls/${rollId}/frames/${frameId}/edit`}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground"
        >
          Edit
        </Link>
      </div>

      {/* Photo placeholder — this exact spot is where the synced image lands in Phase 5. */}
      <div className="mt-4 flex aspect-square items-center justify-center rounded-md border border-border bg-surface">
        <span className="font-mono text-sm text-muted">No photo synced yet</span>
      </div>

      <dl className="mt-4 space-y-3 rounded-md border border-border px-4 py-4 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-xs text-muted">Metadata status</dt>
          <dd>
            {frame.metadata_logged ? (
              <span className="text-xs text-muted-strong">Logged</span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                No Input Logged
              </span>
            )}
          </dd>
        </div>

        {frame.metadata_logged ? (
          <>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted">Shutter speed</dt>
              <dd className="font-mono text-foreground">{frame.shutter_speed}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted">Aperture</dt>
              <dd className="font-mono text-foreground">
                {frame.aperture !== null ? formatAperture(frame.aperture) : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted">Lens</dt>
              <dd className="text-foreground">{lens?.name ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted">Push / Pull</dt>
              <dd className="font-mono text-foreground">
                {frame.push_pull !== null ? formatPush(frame.push_pull) : "—"}
              </dd>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            Exposure metadata was not recorded for this frame.
          </p>
        )}

        {frame.notes && (
          <div>
            <dt className="text-xs text-muted">Note</dt>
            <dd className="mt-0.5 text-foreground">{frame.notes}</dd>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <dt className="text-xs text-muted">Logged on</dt>
          <dd className="text-xs text-muted-strong">
            {formatLongDate(frame.created_at.slice(0, 10))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

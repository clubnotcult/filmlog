import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatAperture, formatPush } from "@/lib/exposure-format";
import { formatLongDate } from "@/lib/date";
import { FrameImagePreview } from "@/components/frame-image-preview";
import { SilentImageRefresh } from "@/components/roll-lifecycle/silent-image-refresh";
import { FavoriteButton } from "@/components/frame-organization/favorite-button";
import { ExposureEvaluationSelect } from "@/components/frame-organization/exposure-evaluation-select";
import { FrameTagsEditor } from "@/components/frame-organization/frame-tags-editor";
import { DeleteFrameMenu } from "@/components/frame-organization/delete-frame-menu";
import { listTags } from "../actions";

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

  const [{ data: lens }, { data: roll }, allTags] = await Promise.all([
    frame.lens_id
      ? supabase.from("lenses").select("name").eq("id", frame.lens_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("rolls").select("drive_folder_id").eq("id", rollId).single(),
    listTags(),
  ]);

  const { data: frameTagRows } = await supabase
    .from("frame_tags")
    .select("tag_id, tags(name)")
    .eq("frame_id", frameId);
  const initialTags = (frameTagRows ?? []).map((row) => ({
    id: row.tag_id,
    name: (row.tags as unknown as { name: string } | null)?.name ?? "",
  }));

  return (
    <div className="mx-auto max-w-md">
      <SilentImageRefresh
        rollId={rollId}
        driveFolderId={roll?.drive_folder_id ?? null}
        frames={[{ id: frame.id, drive_file_id: frame.drive_file_id }]}
      />
      <Link
        href={`/rolls/${rollId}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← Roll
      </Link>

      <div className="mt-2 flex items-center justify-between gap-2">
        <h1 className="font-mono text-2xl text-foreground">
          Frame {frame.frame_number}
        </h1>
        <div className="flex items-center gap-2">
          <FavoriteButton rollId={rollId} frameId={frameId} initialFavorite={frame.is_favorite} />
          <Link
            href={`/rolls/${rollId}/frames/${frameId}/edit`}
            className="flex h-10 items-center rounded-md border border-border px-3 text-xs text-muted-strong hover:text-foreground"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Image preview: shows the synced Drive thumbnail when one exists, the
          same placeholder as before otherwise. This exact spot is where
          every frame's photo lives once synced — nothing about the layout
          changed to activate it. */}
      <div className="mt-4">
        <FrameImagePreview
          thumbnailUrl={frame.drive_thumbnail_url}
          frameNumber={frame.frame_number}
        />
        {frame.drive_view_url && (
          <a
            href={frame.drive_view_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-accent hover:underline"
          >
            Open in Google Drive
          </a>
        )}
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
            {frame.meter_type && (
              <div className="flex items-center justify-between">
                <dt className="text-xs text-muted">Meter</dt>
                <dd className="text-foreground">{frame.meter_type}</dd>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            Exposure metadata was not recorded for this frame.
          </p>
        )}

        <div className="flex items-center justify-between">
          <dt className="text-xs text-muted">Exposure evaluation</dt>
          <dd>
            <ExposureEvaluationSelect
              rollId={rollId}
              frameId={frameId}
              initialValue={frame.exposure_evaluation}
            />
          </dd>
        </div>

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

      <div className="mt-4 rounded-md border border-border px-4 py-4">
        <h2 className="font-mono text-sm tracking-[0.15em] text-muted">TAGS</h2>
        <div className="mt-3">
          <FrameTagsEditor
            rollId={rollId}
            frameId={frameId}
            initialTags={initialTags}
            allTagNames={allTags.map((t) => t.name)}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <DeleteFrameMenu
          rollId={rollId}
          frameId={frameId}
          frameNumber={frame.frame_number}
          hasSyncedImage={frame.drive_file_id !== null}
        />
      </div>
    </div>
  );
}

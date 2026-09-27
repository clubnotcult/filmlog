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
import { NotesQuickEdit } from "@/components/frame-organization/notes-quick-edit";
import { DeleteFrameMenu } from "@/components/frame-organization/delete-frame-menu";
import { computeSystemTags } from "@/lib/tags/system-tags";
import { parseFrameNavContext, resolveFrameNav, contextToQueryString } from "@/lib/frame-nav";
import { listTags } from "../actions";

export default async function FrameDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; frameId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id: rollId, frameId } = await params;
  const rawParams = await searchParams;
  const supabase = await createClient();

  const { data: frame } = await supabase
    .from("frames")
    .select("*")
    .eq("id", frameId)
    .eq("roll_id", rollId)
    .single();

  if (!frame) notFound();

  const navContext = parseFrameNavContext(rollId, rawParams);
  const contextQs = contextToQueryString(navContext);

  const [{ data: lens }, { data: roll }, allTags, nav] = await Promise.all([
    frame.lens_id
      ? supabase.from("lenses").select("name, focal_length").eq("id", frame.lens_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("rolls")
      .select("drive_folder_id, film_stock_id, camera_id")
      .eq("id", rollId)
      .single(),
    listTags(),
    resolveFrameNav(supabase, navContext, frameId),
  ]);

  const [{ data: filmStock }, { data: camera }] = await Promise.all([
    roll ? supabase.from("film_stocks").select("name, format").eq("id", roll.film_stock_id).single() : Promise.resolve({ data: null }),
    roll ? supabase.from("cameras").select("name").eq("id", roll.camera_id).single() : Promise.resolve({ data: null }),
  ]);

  const systemTags = computeSystemTags({
    filmStockName: filmStock?.name ?? null,
    format: filmStock?.format ?? null,
    cameraName: camera?.name ?? null,
    lensName: lens?.name ?? null,
  });

  const { data: frameTagRows } = await supabase
    .from("frame_tags")
    .select("tag_id, tags(name)")
    .eq("frame_id", frameId);
  const initialTags = (frameTagRows ?? []).map((row) => ({
    id: row.tag_id,
    name: (row.tags as unknown as { name: string } | null)?.name ?? "",
  }));

  // Preload the neighbor thumbnails so Next/Previous feels instant — cheap,
  // targeted fetches for exactly the two images most likely to be opened
  // next, not a broader prefetch of the whole roll or result set.
  const [{ data: prevFrame }, { data: nextFrame }] = await Promise.all([
    nav.prevFrameId
      ? supabase.from("frames").select("drive_thumbnail_url").eq("id", nav.prevFrameId).single()
      : Promise.resolve({ data: null }),
    nav.nextFrameId
      ? supabase.from("frames").select("drive_thumbnail_url").eq("id", nav.nextFrameId).single()
      : Promise.resolve({ data: null }),
  ]);

  const prevHref = nav.prevFrameId ? `/rolls/${rollId}/frames/${nav.prevFrameId}${contextQs}` : null;
  const nextHref = nav.nextFrameId ? `/rolls/${rollId}/frames/${nav.nextFrameId}${contextQs}` : null;

  return (
    <div className="mx-auto max-w-md">
      <SilentImageRefresh
        rollId={rollId}
        driveFolderId={roll?.drive_folder_id ?? null}
        frames={[{ id: frame.id, drive_file_id: frame.drive_file_id }]}
      />

      {/* Preload neighbors — invisible, never rendered as part of the layout. */}
      {prevFrame?.drive_thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element -- preload only, deliberately not displayed
        <img src={prevFrame.drive_thumbnail_url} alt="" className="hidden" aria-hidden="true" />
      )}
      {nextFrame?.drive_thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element -- preload only, deliberately not displayed
        <img src={nextFrame.drive_thumbnail_url} alt="" className="hidden" aria-hidden="true" />
      )}

      {/* Header: back link, frame number, Prev/Next — mirrors Active Roll's
          sticky header for a consistent, anchored feel across the app. */}
      <div className="sticky top-0 z-10 -mx-5 border-b border-border bg-background/95 px-5 pb-3 pt-1 backdrop-blur">
        <div className="flex items-center justify-between">
          <Link href={nav.backHref} className="text-xs text-muted hover:text-foreground">
            ← {nav.backLabel}
          </Link>
          <Link
            href={`/rolls/${rollId}/frames/${frameId}/edit`}
            className="text-xs text-muted hover:text-foreground"
          >
            Edit exposure
          </Link>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-2xl text-foreground">Frame {frame.frame_number}</span>
          <div className="flex items-center gap-2">
            <Link
              href={prevHref ?? "#"}
              aria-disabled={!prevHref}
              aria-label="Previous frame"
              className={`flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm ${
                prevHref ? "text-muted-strong hover:text-foreground" : "pointer-events-none opacity-30"
              }`}
            >
              ←
            </Link>
            <Link
              href={nextHref ?? "#"}
              aria-disabled={!nextHref}
              aria-label="Next frame"
              className={`flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm ${
                nextHref ? "text-muted-strong hover:text-foreground" : "pointer-events-none opacity-30"
              }`}
            >
              →
            </Link>
          </div>
        </div>
      </div>

      {/* The photograph is the primary visual element — full width, no
          competing metadata alongside it. Everything else lives below. */}
      <div className="mt-4">
        <FrameImagePreview
          thumbnailUrl={frame.drive_thumbnail_url}
          frameNumber={frame.frame_number}
        />
      </div>

      {/* Fast review controls: the whole point of this screen. Favorite and
          exposure evaluation are one tap, no separate editing screen. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <FavoriteButton rollId={rollId} frameId={frameId} initialFavorite={frame.is_favorite} />
        <ExposureEvaluationSelect
          rollId={rollId}
          frameId={frameId}
          initialValue={frame.exposure_evaluation}
        />
      </div>

      <div className="mt-4">
        <FrameTagsEditor
          rollId={rollId}
          frameId={frameId}
          driveFileId={frame.drive_file_id}
          systemTags={systemTags}
          initialTags={initialTags}
          allTagNames={allTags.map((t) => t.name)}
        />
      </div>

      <div className="mt-4">
        <NotesQuickEdit rollId={rollId} frameId={frameId} initialNotes={frame.notes} />
      </div>

      {frame.drive_view_url && (
        <a
          href={frame.drive_view_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs text-accent hover:underline"
        >
          Open in Google Drive
        </a>
      )}

      {/* Secondary metadata — supports the review, doesn't compete with it. */}
      <details className="mt-6 rounded-md border border-border px-4 py-3">
        <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted">
          Exposure details
        </summary>
        <dl className="mt-3 space-y-2 text-sm">
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
            <p className="text-sm text-muted">Exposure metadata was not recorded for this frame.</p>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <dt className="text-xs text-muted">Logged on</dt>
            <dd className="text-xs text-muted-strong">
              {formatLongDate(frame.created_at.slice(0, 10))}
            </dd>
          </div>
        </dl>
      </details>

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

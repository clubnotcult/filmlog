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

  const navCell =
    "numeral flex h-14 items-center text-sm uppercase tracking-[0.14em] transition-colors";

  return (
    <div className="mx-auto max-w-md">
      <SilentImageRefresh
        rollId={rollId}
        driveFolderId={roll?.drive_folder_id ?? null}
        frames={[{ id: frame.id, drive_file_id: frame.drive_file_id }]}
      />

      {/* Preload neighbors — invisible, never part of the layout. */}
      {prevFrame?.drive_thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element -- preload only, deliberately not displayed
        <img src={prevFrame.drive_thumbnail_url} alt="" className="hidden" aria-hidden="true" />
      )}
      {nextFrame?.drive_thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element -- preload only, deliberately not displayed
        <img src={nextFrame.drive_thumbnail_url} alt="" className="hidden" aria-hidden="true" />
      )}

      <div className="flex items-center justify-between">
        <Link href={nav.backHref} className="label !text-muted-strong hover:!text-foreground">
          ← {nav.backLabel}
        </Link>
        <Link
          href={`/rolls/${rollId}/frames/${frameId}/edit`}
          className="label hover:!text-foreground"
        >
          Edit exposure
        </Link>
      </div>

      {/* The photograph: full-bleed on a phone, a fixed square so it reserves
          its space before the image arrives and nothing below ever moves. */}
      <div className="mt-4">
        <FrameImagePreview
          thumbnailUrl={frame.drive_thumbnail_url}
          frameNumber={frame.frame_number}
        />
      </div>

      {/* Frame readout + navigation as one instrument strip. Three fixed
          columns: the number never shifts, and an unavailable direction is
          dimmed in place rather than removed. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border">
        {prevHref ? (
          <Link href={prevHref} aria-label="Previous frame" className={`${navCell} justify-start text-muted-strong hover:text-foreground`}>
            ← Prev
          </Link>
        ) : (
          <span aria-hidden="true" className={`${navCell} justify-start text-muted opacity-25`}>← Prev</span>
        )}
        <div className="flex flex-col items-center px-4">
          <span className="label">Frame</span>
          <span className="numeral mt-1 text-4xl font-light leading-none">
            {String(frame.frame_number).padStart(2, "0")}
          </span>
        </div>
        {nextHref ? (
          <Link href={nextHref} aria-label="Next frame" className={`${navCell} justify-end text-muted-strong hover:text-foreground`}>
            Next →
          </Link>
        ) : (
          <span aria-hidden="true" className={`${navCell} justify-end text-muted opacity-25`}>Next →</span>
        )}
      </div>

      <div className="border-b border-border">
        <FavoriteButton rollId={rollId} frameId={frameId} initialFavorite={frame.is_favorite} />
      </div>

      <div className="border-b border-border py-5">
        <FrameTagsEditor
          rollId={rollId}
          frameId={frameId}
          driveFileId={frame.drive_file_id}
          systemTags={systemTags}
          initialTags={initialTags}
          allTagNames={allTags.map((t) => t.name)}
        />
      </div>

      <div className="border-b border-border py-5">
        <span className="label">Exposure</span>
        <div className="mt-2">
          <ExposureEvaluationSelect
            rollId={rollId}
            frameId={frameId}
            initialValue={frame.exposure_evaluation}
          />
        </div>
      </div>

      {/* Metadata: the readings, set as type. Shutter and aperture are the
          two numbers a photographer actually looks for, so they're large;
          everything else is a quiet ruled list. */}
      <div className="border-b border-border py-5">
        <span className="label">Metadata</span>
        {frame.metadata_logged ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-x-6">
              <div>
                <span className="label">Shutter</span>
                <div className="numeral mt-1.5 text-3xl font-light leading-none">
                  {frame.shutter_speed ?? "—"}
                </div>
              </div>
              <div>
                <span className="label">Aperture</span>
                <div className="numeral mt-1.5 text-3xl font-light leading-none">
                  {frame.aperture !== null ? formatAperture(frame.aperture) : "—"}
                </div>
              </div>
            </div>
            <dl className="mt-5 divide-y divide-border border-y border-border text-sm">
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="label">Film</dt>
                <dd className="text-foreground">{filmStock?.name ?? "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="label">Camera</dt>
                <dd className="text-foreground">{camera?.name ?? "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="label">Lens</dt>
                <dd className="text-foreground">{lens?.name ?? "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="label">Meter</dt>
                <dd className="text-foreground">{frame.meter_type ?? "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="label">Push / Pull</dt>
                <dd className="numeral text-foreground">
                  {frame.push_pull !== null ? formatPush(frame.push_pull) : "—"}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No exposure input was logged for this frame.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          Logged {formatLongDate(frame.created_at.slice(0, 10))}
        </p>
      </div>

      <div className="py-5">
        <NotesQuickEdit rollId={rollId} frameId={frameId} initialNotes={frame.notes} />
      </div>

      <div className="flex items-center justify-between pb-2">
        {frame.drive_view_url ? (
          <a
            href={frame.drive_view_url}
            target="_blank"
            rel="noreferrer"
            className="label !text-accent hover:underline"
          >
            Open in Drive ↗
          </a>
        ) : (
          <span />
        )}
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

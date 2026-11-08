import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatAperture } from "@/lib/exposure-format";
import { formatLongDate } from "@/lib/date";
import { FrameImagePreview } from "@/components/frame-image-preview";
import { SilentImageRefresh } from "@/components/roll-lifecycle/silent-image-refresh";
import { SelectionControl } from "@/components/frame-organization/selection-control";
import { ExposureEvaluationSelect } from "@/components/frame-organization/exposure-evaluation-select";
import { FrameTagsEditor } from "@/components/frame-organization/frame-tags-editor";
import { NotesQuickEdit } from "@/components/frame-organization/notes-quick-edit";
import { DeleteFrameMenu } from "@/components/frame-organization/delete-frame-menu";
import { InsertFrameControls } from "@/components/frame-organization/insert-frame-controls";
import { LocationField } from "@/components/frame-organization/location-field";
import { computeSystemTags } from "@/lib/tags/system-tags";
import { generateRollTitle } from "@/lib/roll-title";
import { effectiveLensId, effectiveLocationId } from "@/lib/effective-metadata";
import { apertureApplies, shutterApplies } from "@/lib/camera-exposure";
import { parseFilmCardDesign } from "@/lib/film-card";
import { FilmCard } from "@/components/film-card";
import { parseFrameNavContext, resolveFrameNav, contextToQueryString } from "@/lib/frame-nav";
import { listTags } from "../actions";
import { listLocations } from "@/app/(app)/locations/actions";

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

  const { data: frame, error: frameError } = await supabase
    .from("frames")
    .select("*")
    .eq("id", frameId)
    .eq("roll_id", rollId)
    .maybeSingle();

  // A failed query (network blip, expired session, Supabase hiccup) is not a
  // missing frame. Only a clean "no such row" is a 404; anything else goes to
  // the error boundary, which offers Try again instead of losing the session.
  if (frameError) throw new Error(`Couldn't load this frame: ${frameError.message}`);
  if (!frame) notFound();

  const navContext = parseFrameNavContext(rollId, rawParams);
  const contextQs = contextToQueryString(navContext);

  const [{ data: roll }, { data: rollFrames }, allTags, allLocations, nav] = await Promise.all([
    supabase
      .from("rolls")
      .select(
        "drive_folder_id, film_stock_id, camera_id, default_lens_id, location_id, start_date, end_date, custom_title, status",
      )
      .eq("id", rollId)
      .single(),
    supabase.from("frames").select("id, drive_file_id").eq("roll_id", rollId),
    listTags(),
    listLocations(),
    resolveFrameNav(supabase, navContext, frameId),
  ]);

  // Roll inheritance: the frame's own lens/location win; otherwise the
  // roll's defaults apply. Shown with their source so an inherited value is
  // never mistaken for one set on this frame.
  const lensRef = roll ? effectiveLensId(frame, roll) : { value: frame.lens_id, source: frame.lens_id ? "frame" : null };
  const locationRef = roll
    ? effectiveLocationId(frame, roll)
    : { value: frame.location_id, source: frame.location_id ? "frame" : null };
  const currentLocation = locationRef.value
    ? allLocations.find((l) => l.id === locationRef.value) ?? null
    : null;

  const [{ data: filmStock }, { data: camera }, { data: lens }, { data: rollTagRows }] = await Promise.all([
    roll
      ? supabase.from("film_stocks").select("name, format, film_type, iso, card_design").eq("id", roll.film_stock_id).single()
      : Promise.resolve({ data: null }),
    roll ? supabase.from("cameras").select("name, exposure_control").eq("id", roll.camera_id).single() : Promise.resolve({ data: null }),
    lensRef.value
      ? supabase.from("lenses").select("name, focal_length").eq("id", lensRef.value).single()
      : Promise.resolve({ data: null }),
    supabase.from("roll_tags").select("tags(name)").eq("roll_id", rollId),
  ]);
  const rollTagNames = (rollTagRows ?? [])
    .map((r) => (r.tags as unknown as { name: string } | null)?.name)
    .filter((n): n is string => Boolean(n));
  const showShutter = shutterApplies(camera?.exposure_control);
  const showAperture = apertureApplies(camera?.exposure_control);
  const rollTitle = roll
    ? generateRollTitle({
        startDate: roll.start_date,
        endDate: roll.end_date,
        filmStockName: filmStock?.name ?? "Unknown film",
        customTitle: roll.custom_title,
      })
    : null;

  const systemTags = computeSystemTags({
    filmStockName: filmStock?.name ?? null,
    format: filmStock?.format ?? null,
    filmType: filmStock?.film_type ?? null,
    cameraName: camera?.name ?? null,
    lensName: lens?.name ?? null,
    locationName: currentLocation?.name ?? null,
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

  // Each neighbor's own roll, not this page's: in Explore the next photograph
  // can belong to a different roll, and /rolls/<wrong roll>/frames/<id> is a 404.
  const prevHref =
    nav.prevFrameId && nav.prevRollId ? `/rolls/${nav.prevRollId}/frames/${nav.prevFrameId}${contextQs}` : null;
  const nextHref =
    nav.nextFrameId && nav.nextRollId ? `/rolls/${nav.nextRollId}/frames/${nav.nextFrameId}${contextQs}` : null;

  const navCell =
    "numeral flex h-14 items-center text-sm uppercase tracking-[0.14em] transition-colors";

  return (
    <div className="mx-auto max-w-md">
      <SilentImageRefresh
        rollId={rollId}
        driveFolderId={roll?.drive_folder_id ?? null}
        frames={rollFrames ?? []}
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
          Edit metadata
        </Link>
      </div>

      {/* The photograph: full-bleed on a phone, a fixed square so it reserves
          its space before the image arrives and nothing below ever moves. */}
      <div className="mt-4">
        <FrameImagePreview
          thumbnailUrl={frame.drive_thumbnail_url}
          frameNumber={frame.frame_number}
          frameId={frame.id}
          rollId={rollId}
          driveFolderId={roll?.drive_folder_id ?? null}
          rollFrames={rollFrames ?? []}
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
          <span className="numeral mt-1.5 text-xl leading-none text-muted-strong">
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

      {/* Title block. The Drive filename is the image's identity — the thing
          to match against the raw file — so it leads, in the one slightly
          larger size on the screen. Film + camera follow as secondary
          information, then lens and exposure as supporting detail. It sits
          below the Prev/Next strip, not above it, so the strip never moves
          when a filename runs long; a very long name wraps (up to two
          lines) rather than scrolling sideways or being cut off. */}
      <div className="border-b border-border py-4">
        <h1
          className="line-clamp-2 break-all font-mono text-xl leading-snug text-foreground"
          title={frame.drive_filename ?? undefined}
        >
          {frame.drive_filename ?? `Frame ${frame.frame_number}`}
        </h1>
        {roll && rollTitle && (
          <div className="mt-3 flex items-start gap-3">
            <FilmCard
              design={parseFilmCardDesign(filmStock?.card_design)}
              iso={filmStock?.iso ?? null}
              name={filmStock?.name ?? ""}
              size="sm"
            />
            <div className="min-w-0">
              <Link
                href={`/rolls/${rollId}`}
                className="block text-sm leading-snug text-foreground underline-offset-4 hover:underline"
              >
                {rollTitle}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {formatLongDate(roll.start_date)}
                {roll.end_date ? ` – ${formatLongDate(roll.end_date)}` : roll.status === "active" ? " – in progress" : ""}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-strong">
                {[filmStock?.name, camera?.name].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          </div>
        )}
        <p className="numeral mt-3 truncate text-xs text-muted">
          {[
            lens?.name,
            showShutter ? frame.shutter_speed : null,
            showAperture && frame.aperture !== null ? formatAperture(frame.aperture) : null,
          ]
            .filter(Boolean)
            .join(" · ") || (frame.metadata_logged ? "" : "No exposure input logged")}
        </p>
      </div>

      <div className="border-b border-border">
        <SelectionControl
          key={frameId}
          rollId={rollId}
          frameId={frameId}
          initialSelection={frame.selection}
        />
      </div>

      <div className="border-b border-border py-5">
        <FrameTagsEditor
          rollId={rollId}
          frameId={frameId}
          driveFileId={frame.drive_file_id}
          systemTags={systemTags}
          rollTags={rollTagNames}
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
        {(showShutter || showAperture) && (
          <div className="mt-3 grid grid-cols-2 gap-x-6">
            <div>
              <span className="label">Shutter</span>
              <div className="numeral mt-1.5 text-3xl font-light leading-none">
                {showShutter ? (frame.shutter_speed ?? "—") : "N/A"}
              </div>
            </div>
            <div>
              <span className="label">Aperture</span>
              <div className="numeral mt-1.5 text-3xl font-light leading-none">
                {!showAperture ? "N/A" : frame.aperture !== null ? formatAperture(frame.aperture) : "—"}
              </div>
            </div>
          </div>
        )}
        {!frame.metadata_logged && (showShutter || showAperture) && (
          <p className="mt-2 text-xs text-muted">No exposure input was logged for this frame.</p>
        )}
        {!showShutter && !showAperture && (
          <p className="mt-2 text-xs text-muted">Automatic camera — shutter and aperture are not applicable.</p>
        )}
        <dl className="mt-5 divide-y divide-border border-y border-border text-sm">
          <div className="flex items-baseline justify-between py-2.5">
            <dt className="label">Film</dt>
            <dd className="text-foreground">{filmStock?.name ?? "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between py-2.5">
            <dt className="label">Camera</dt>
            <dd className="text-foreground">{camera?.name ?? "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="label">Lens</dt>
            <dd className="text-right text-foreground">
              {lens?.name ?? <span className="text-muted">Unknown</span>}
              {lensRef.source === "roll" && <span className="ml-2 text-xs text-muted">from roll</span>}
            </dd>
          </div>
          {frame.metadata_logged && (
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="label">Meter</dt>
              <dd className="text-foreground">{frame.meter_type ?? "—"}</dd>
            </div>
          )}
          <LocationField
            rollId={rollId}
            frameId={frameId}
            initialName={locationRef.source === "frame" ? (currentLocation?.name ?? null) : null}
            inheritedName={locationRef.source === "roll" ? (currentLocation?.name ?? null) : null}
            allLocationNames={allLocations.map((l) => l.name)}
          />
        </dl>
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

      <div className="mt-3 border-t border-border pt-3">
        <InsertFrameControls rollId={rollId} frameNumber={frame.frame_number} />
      </div>
    </div>
  );
}

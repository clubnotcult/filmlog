import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateRollTitle } from "@/lib/roll-title";
import { formatLongDate } from "@/lib/date";
import { computeSyncStatus, syncStatusLabel, syncStatusColorClass } from "@/lib/sync-status";
import { ReopenRollButton } from "@/components/active-roll/reopen-roll-button";
import { ArchiveRollButton, RestoreRollButton } from "@/components/roll-lifecycle/archive-restore-buttons";
import { DeleteRollMenu } from "@/components/roll-lifecycle/delete-roll-menu";
import { SyncPhotosPanel } from "@/components/roll-lifecycle/sync-photos-panel";
import { SilentImageRefresh } from "@/components/roll-lifecycle/silent-image-refresh";
import { RefreshImagesButton } from "@/components/roll-lifecycle/refresh-images-button";
import { RollMetadataEditor } from "@/components/roll-lifecycle/roll-metadata-editor";
import { ImportRollPanel } from "@/components/roll-lifecycle/import-roll-panel";
import { FinishRollControl } from "@/components/roll-lifecycle/finish-roll-control";
import { RollDefaultsEditor } from "@/components/roll-lifecycle/roll-defaults-editor";
import { FilmCard } from "@/components/film-card";
import { parseFilmCardDesign } from "@/lib/film-card";
import { exposureControlLabel } from "@/lib/camera-exposure";
import { listLocations } from "@/app/(app)/locations/actions";
import { FrameGridWithBulkTag } from "@/components/frame-organization/frame-grid-with-bulk-tag";
import { DriveFolderControl } from "@/components/roll-lifecycle/drive-folder-control";
import { generateDriveFolderName } from "@/lib/drive-folder-name";
import { driveSectionState } from "@/lib/drive-section";
import { driveFolderUrl } from "@/lib/google-drive/folders";
import { filmFormatLabel, filmTypeLabel } from "@/lib/film-classification";
import { listTags } from "./frames/actions";
import { getArchiveRoot } from "./drive/actions";

export default async function RollDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ importError?: string }>;
}) {
  const { id } = await params;
  const { importError } = await searchParams;
  const supabase = await createClient();

  const { data: roll } = await supabase
    .from("rolls")
    .select("*")
    .eq("id", id)
    .single();

  if (!roll) notFound();

  const [
    { data: filmStock },
    { data: camera },
    { data: frames },
    { data: allLenses },
    { data: latestSync },
    tags,
    archiveRoot,
    { data: rollTagRows },
    allLocations,
  ] =
    await Promise.all([
      supabase.from("film_stocks").select("name, format, film_type, iso, card_design").eq("id", roll.film_stock_id).single(),
      supabase.from("cameras").select("name, exposure_control").eq("id", roll.camera_id).single(),
      supabase
        .from("frames")
        .select("*")
        .eq("roll_id", roll.id)
        .order("frame_number", { ascending: true }),
      // All lenses, not just active — a historical frame may reference a
      // lens that's since been deactivated, and its name still needs to show.
      supabase.from("lenses").select("id, name, active").order("name"),
      supabase
        .from("roll_sync_history")
        .select("*")
        .eq("roll_id", roll.id)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      listTags(),
      getArchiveRoot(),
      supabase.from("roll_tags").select("tag_id, tags(name)").eq("roll_id", id),
      listLocations(),
    ]);

  const rollTags = (rollTagRows ?? [])
    .map((r) => ({ id: r.tag_id, name: (r.tags as unknown as { name: string } | null)?.name ?? "" }))
    .filter((t) => t.name);
  const rollLocationName = roll.location_id
    ? (allLocations.find((l) => l.id === roll.location_id)?.name ?? null)
    : null;

  const allTagNames = tags.map((t) => t.name);

  const title = generateRollTitle({
    startDate: roll.start_date,
    endDate: roll.end_date,
    filmStockName: filmStock?.name ?? "Unknown film",
    customTitle: roll.custom_title,
  });

  const lensNameById = new Map((allLenses ?? []).map((l) => [l.id, l.name]));
  const frameList = frames ?? [];

  const locationIds = [
    ...new Set(
      [roll.location_id, ...frameList.map((f) => f.location_id)].filter((v): v is string => Boolean(v)),
    ),
  ];
  const { data: rollLocations } =
    locationIds.length > 0
      ? await supabase.from("locations").select("id, name").in("id", locationIds)
      : { data: [] as { id: string; name: string }[] };
  const locationNameById = new Map((rollLocations ?? []).map((l) => [l.id, l.name]));
  const syncStatus = computeSyncStatus(frameList);
  const driveSection = driveSectionState(roll);
  const driveFolderName = generateDriveFolderName({
    startDate: roll.start_date,
    endDate: roll.end_date,
    filmStockName: filmStock?.name ?? "",
    locationNames: [roll.location_id, ...frameList.map((f) => f.location_id ?? roll.location_id)]
      .map((locId) => (locId ? locationNameById.get(locId) : undefined))
      .filter((n): n is string => Boolean(n)),
  });

  // --- Statistics -----------------------------------------------------
  const totalFrames = frameList.length;
  const loggedFrames = frameList.filter((f) => f.metadata_logged);
  const unloggedCount = totalFrames - loggedFrames.length;
  const framesWithImages = frameList.filter((f) => f.drive_file_id).length;
  const framesWithoutImages = totalFrames - framesWithImages;

  const lensesUsed = Array.from(
    new Set(
      frameList
        .map((f) => f.lens_id ?? roll.default_lens_id)
        .map((lensId) => (lensId ? lensNameById.get(lensId) : null))
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort();



  return (
    <div className="mx-auto max-w-3xl">
      <SilentImageRefresh
        rollId={roll.id}
        driveFolderId={roll.drive_folder_id}
        frames={frameList.map((f) => ({ id: f.id, drive_file_id: f.drive_file_id }))}
      />
      <Link href="/rolls" className="text-xs text-muted hover:text-foreground">
        ← Rolls
      </Link>

      <div className="mt-3 flex items-start gap-4">
        <FilmCard
          design={parseFilmCardDesign(filmStock?.card_design)}
          iso={filmStock?.iso ?? null}
          name={filmStock?.name ?? ""}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 break-words text-2xl font-light leading-snug tracking-tight text-foreground">{title}</h1>
            <span className={`label mt-2 shrink-0 ${roll.status === "active" ? "!text-accent" : ""}`}>
              {roll.status === "active" ? "In progress" : roll.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-strong">
            {formatLongDate(roll.start_date)} – {roll.end_date ? formatLongDate(roll.end_date) : <span className="text-muted">open</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {[
              filmStock?.name,
              [filmTypeLabel(filmStock?.film_type), filmFormatLabel(filmStock?.format)].filter(Boolean).join(" "),
              camera?.name,
              camera && camera.exposure_control !== "manual" ? exposureControlLabel(camera.exposure_control) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {roll.status === "active" ? (
          <>
            <FinishRollControl rollId={roll.id} startDate={roll.start_date} />
            <Link
              href={`/active-roll/${roll.id}`}
              className="label inline-flex h-10 items-center justify-center px-3 !text-muted-strong hover:!text-foreground"
            >
              Shooting log
            </Link>
          </>
        ) : roll.status === "completed" ? (
          <>
            <ReopenRollButton rollId={roll.id} />
            <ArchiveRollButton rollId={roll.id} />
          </>
        ) : (
          <RestoreRollButton rollId={roll.id} />
        )}
      </div>

      <section className="mt-6 border-y border-border py-5">
        <h2 className="label">Shared details</h2>
        <p className="mt-1 text-xs text-muted">Applied to every image unless an image sets its own.</p>
        <div className="mt-4">
          <RollDefaultsEditor
            rollId={roll.id}
            lenses={(allLenses ?? []).filter((l) => l.active || l.id === roll.default_lens_id)}
            defaultLensId={roll.default_lens_id}
            locationName={rollLocationName}
            tags={rollTags}
            allLocationNames={allLocations.map((l) => l.name)}
            allTagNames={allTagNames}
          />
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border py-4 text-sm">
        <div className="col-span-2">
          <RollMetadataEditor
            rollId={roll.id}
            startDate={roll.start_date}
            endDate={roll.end_date}
            customTitle={roll.custom_title}
            notes={roll.notes}
          />
        </div>
        {roll.notes && (
          <div className="col-span-2">
            <dt className="text-xs text-muted">Notes</dt>
            <dd className="mt-0.5 text-foreground">{roll.notes}</dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-xs text-muted">Google Drive photos</dt>
          <dd className="mt-0.5 text-muted-strong">
            <span className={syncStatusColorClass(syncStatus)}>
              {syncStatusLabel(syncStatus)}
            </span>
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

      {/* Drive archive folders — see driveSectionState for the visibility rules. */}
      {driveSection.kind !== "hidden" && (
        <div className="mt-6 border-b border-border pb-4">
          <h2 className="label">GOOGLE DRIVE</h2>
          {driveSection.kind === "linked" ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-foreground">
                {[driveSection.folderCreated ? "Folder Created" : null, driveSection.driveLinked ? "Drive Linked" : null]
                  .filter(Boolean)
                  .join(" · ")}
                {driveSection.folderCreated && <span className="text-xs text-muted"> · RAW · JPEG · SELECTS</span>}
              </p>
              <a
                href={driveFolderUrl(driveSection.openFolderId)}
                target="_blank"
                rel="noopener noreferrer"
                className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground"
              >
                Open in Drive
              </a>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {driveSection.syncedFolderId && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="text-foreground">Drive Linked</p>
                  <a
                    href={driveFolderUrl(driveSection.syncedFolderId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground"
                  >
                    Open in Drive
                  </a>
                </div>
              )}
              <DriveFolderControl
                rollId={roll.id}
                folderName={driveFolderName}
                year={roll.start_date.slice(0, 4)}
                archiveRoot={archiveRoot.ok ? archiveRoot.data : null}
                existingImageFolderId={driveSection.syncedFolderId}
              />
            </div>
          )}
        </div>
      )}

      {totalFrames > 0 && (
        <div className="mt-6 border-y border-border py-4">
          <h2 className="label">
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
          </dl>
        </div>
      )}

      <div className="mt-6 border-y border-border py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="label">
            {totalFrames > 0 ? `${totalFrames} FRAMES` : "IMAGES"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {roll.drive_folder_id && framesWithImages > 0 && (
              <RefreshImagesButton
                rollId={roll.id}
                driveFolderId={roll.drive_folder_id}
                frames={frameList.map((f) => ({ id: f.id, drive_file_id: f.drive_file_id }))}
              />
            )}
            {/* A shooting log whose frames still need their scans is matched
                positionally (Sync Photos); everything else imports by file,
                one frame per image, safe to repeat. */}
            {framesWithoutImages > 0 ? (
              <SyncPhotosPanel
                rollId={roll.id}
                frames={frameList.map((f) => ({ id: f.id, frame_number: f.frame_number }))}
                linkedJpegFolderId={roll.drive_jpeg_folder_id}
              />
            ) : (
              <ImportRollPanel
                rollId={roll.id}
                linkedFolderId={roll.drive_folder_id ?? roll.drive_jpeg_folder_id}
                existingFileIds={frameList.map((f) => f.drive_file_id).filter((v): v is string => Boolean(v))}
                lastFrameNumber={frameList.reduce((m, f) => Math.max(m, f.frame_number), 0)}
              />
            )}
          </div>
        </div>

        {importError && (
          <p className="mt-3 text-sm text-danger">
            The roll was created, but importing its images failed: {importError}. Try the import again below — nothing
            will be duplicated.
          </p>
        )}

        {totalFrames === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No images yet. Import the roll&apos;s JPEG folder and a frame is created for each image.
          </p>
        ) : (
          <div className="mt-4">
            <FrameGridWithBulkTag
              rollId={roll.id}
              frames={frameList}
              lensNameById={lensNameById}
              allTagNames={allTagNames}
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <DeleteRollMenu rollId={roll.id} frameCount={totalFrames} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatApertureStops, formatShutterSpeeds } from "@/lib/gear-values";
import { ConfirmDeleteButton, ToggleActiveButton } from "@/components/row-actions";
import {
  deleteCamera,
  deleteLens,
  setCameraActive,
  setLensActive,
} from "./actions";

export default async function GearPage() {
  const supabase = await createClient();

  const [{ data: cameras }, { data: lenses }] = await Promise.all([
    supabase
      .from("cameras")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("lenses")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-light tracking-tight text-foreground">GEAR</h1>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="label">
            CAMERAS
          </h2>
          <Link
            href="/gear/cameras/new"
            className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
          >
            Add camera
          </Link>
        </div>

        {!cameras || cameras.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No cameras yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {cameras.map((camera) => (
              <li
                key={camera.id}
                className={`flex items-start justify-between gap-4 px-4 py-3 ${
                  camera.active ? "" : "opacity-50"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {camera.name}
                    </span>
                    {camera.format && (
                      <span className="text-xs text-muted">{camera.format}</span>
                    )}
                    {!camera.active && (
                      <span className="label">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-strong">
                    {formatShutterSpeeds(camera.shutter_speeds)}
                  </p>
                  {camera.notes && (
                    <p className="mt-1 text-xs text-muted">{camera.notes}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Link
                    href={`/gear/cameras/${camera.id}/edit`}
                    className="label flex h-10 items-center px-1 !text-muted-strong hover:!text-foreground"
                  >
                    Edit
                  </Link>
                  <div className="flex gap-2">
                    <ToggleActiveButton
                      action={setCameraActive.bind(null, camera.id, !camera.active)}
                      active={camera.active}
                    />
                    <ConfirmDeleteButton
                      action={deleteCamera.bind(null, camera.id)}
                      itemLabel={camera.name}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="label">
            LENSES
          </h2>
          <Link
            href="/gear/lenses/new"
            className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
          >
            Add lens
          </Link>
        </div>

        {!lenses || lenses.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No lenses yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {lenses.map((lens) => (
              <li
                key={lens.id}
                className={`flex items-start justify-between gap-4 px-4 py-3 ${
                  lens.active ? "" : "opacity-50"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {lens.name}
                    </span>
                    {lens.focal_length && (
                      <span className="text-xs text-muted">
                        {lens.focal_length}
                      </span>
                    )}
                    {!lens.active && (
                      <span className="label">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-strong">
                    {formatApertureStops(lens.aperture_stops)}
                  </p>
                  {lens.notes && (
                    <p className="mt-1 text-xs text-muted">{lens.notes}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Link
                    href={`/gear/lenses/${lens.id}/edit`}
                    className="label flex h-10 items-center px-1 !text-muted-strong hover:!text-foreground"
                  >
                    Edit
                  </Link>
                  <div className="flex gap-2">
                    <ToggleActiveButton
                      action={setLensActive.bind(null, lens.id, !lens.active)}
                      active={lens.active}
                    />
                    <ConfirmDeleteButton
                      action={deleteLens.bind(null, lens.id)}
                      itemLabel={lens.name}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

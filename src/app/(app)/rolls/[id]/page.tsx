import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateRollTitle } from "@/lib/roll-title";
import { formatLongDate } from "@/lib/date";

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

  const [{ data: filmStock }, { data: camera }, { data: lens }, { count: frameCount }] =
    await Promise.all([
      supabase
        .from("film_stocks")
        .select("name")
        .eq("id", roll.film_stock_id)
        .single(),
      supabase.from("cameras").select("name").eq("id", roll.camera_id).single(),
      supabase
        .from("lenses")
        .select("name")
        .eq("id", roll.default_lens_id)
        .single(),
      supabase
        .from("frames")
        .select("id", { count: "exact", head: true })
        .eq("roll_id", roll.id),
    ]);

  const title = generateRollTitle({
    startDate: roll.start_date,
    endDate: roll.end_date,
    filmStockName: filmStock?.name ?? "Unknown film",
    customTitle: roll.custom_title,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/rolls" className="text-xs text-muted hover:text-foreground">
        ← Rolls
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="font-mono text-lg text-foreground">{title}</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            roll.status === "active"
              ? "bg-accent/20 text-accent"
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
          <dd className="mt-0.5 text-foreground">{lens?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Current frame</dt>
          <dd className="mt-0.5 font-mono text-foreground">{roll.current_frame}</dd>
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
            {roll.drive_folder_id ? "Synced" : "Not synced yet"}
          </dd>
        </div>
      </dl>

      <div className="mt-6 rounded-md border border-border px-4 py-4">
        <h2 className="font-mono text-sm tracking-wide text-foreground">
          FRAMES
        </h2>
        <p className="mt-2 text-sm text-muted">
          {frameCount ?? 0} {frameCount === 1 ? "frame" : "frames"} logged.
        </p>
        <p className="mt-1 text-xs text-muted">
          The shooting interface for logging frames is coming in Phase 3.
        </p>
      </div>
    </div>
  );
}

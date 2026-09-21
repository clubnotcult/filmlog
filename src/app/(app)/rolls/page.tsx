import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { generateRollTitle } from "@/lib/roll-title";
import { formatLongDate } from "@/lib/date";

export default async function RollsPage() {
  const supabase = await createClient();

  const [
    { data: rolls },
    { data: filmStocks },
    { data: cameras },
    { data: lenses },
    { data: frames },
  ] = await Promise.all([
    supabase.from("rolls").select("*").order("start_date", { ascending: false }),
    supabase.from("film_stocks").select("id, name"),
    supabase.from("cameras").select("id, name"),
    supabase.from("lenses").select("id, name"),
    supabase.from("frames").select("roll_id"),
  ]);

  const filmStockById = new Map((filmStocks ?? []).map((f) => [f.id, f.name]));
  const cameraById = new Map((cameras ?? []).map((c) => [c.id, c.name]));
  const lensById = new Map((lenses ?? []).map((l) => [l.id, l.name]));

  const frameCountByRoll = new Map<string, number>();
  for (const frame of frames ?? []) {
    frameCountByRoll.set(
      frame.roll_id,
      (frameCountByRoll.get(frame.roll_id) ?? 0) + 1,
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">
          ROLLS
        </h1>
        <Link
          href="/rolls/new"
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black"
        >
          Start a roll
        </Link>
      </div>

      {!rolls || rolls.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No rolls yet.{" "}
          <Link href="/rolls/new" className="text-accent hover:underline">
            Start your first roll
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rolls.map((roll) => {
            const filmStockName = filmStockById.get(roll.film_stock_id) ?? "Unknown film";
            const cameraName = cameraById.get(roll.camera_id) ?? "Unknown camera";
            const lensName = lensById.get(roll.default_lens_id) ?? "Unknown lens";
            const frameCount = frameCountByRoll.get(roll.id) ?? 0;
            const title = generateRollTitle({
              startDate: roll.start_date,
              endDate: roll.end_date,
              filmStockName,
              customTitle: roll.custom_title,
            });

            return (
              <li key={roll.id}>
                <Link
                  href={`/rolls/${roll.id}`}
                  className="block rounded-md border border-border px-4 py-3 hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-foreground">{title}</p>
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
                  <p className="mt-1 text-xs text-muted">
                    {cameraName} · {lensName} · {frameCount}{" "}
                    {frameCount === 1 ? "frame" : "frames"} · Photos not synced
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Started {formatLongDate(roll.start_date)}
                    {roll.end_date && ` · Finished ${formatLongDate(roll.end_date)}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

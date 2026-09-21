import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateRollTitle } from "@/lib/roll-title";
import { ActiveRollShooter } from "@/components/active-roll/shooter";
import type { Lens } from "@/lib/database.types";

export default async function ActiveRollShootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: roll } = await supabase.from("rolls").select("*").eq("id", id).single();
  if (!roll) notFound();

  const [
    { data: camera },
    { data: activeLenses },
    { data: filmStock },
    { data: latestFrame },
    { data: lastLoggedFrame },
  ] = await Promise.all([
    supabase.from("cameras").select("*").eq("id", roll.camera_id).single(),
    supabase.from("lenses").select("*").eq("active", true).order("name", { ascending: true }),
    supabase.from("film_stocks").select("name").eq("id", roll.film_stock_id).single(),
    // The true latest frame regardless of logged status — frame numbering
    // must account for every saved frame, logged or not, and this is also
    // the frame the "fix previous frame" fast-correction link points at.
    supabase
      .from("frames")
      .select("id, frame_number")
      .eq("roll_id", roll.id)
      .order("frame_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // The latest LOGGED frame — the only thing the shooter should inherit
    // from. An unlogged frame carries no exposure info to inherit.
    supabase
      .from("frames")
      .select("*")
      .eq("roll_id", roll.id)
      .eq("metadata_logged", true)
      .order("frame_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!camera) notFound();

  // The default lens (or, if a logged frame exists, the lens it used) must
  // always be representable even if it's since been deactivated — otherwise
  // the shooter would silently show no lens selected for gear that's
  // actually mounted.
  let lenses: Lens[] = activeLenses ?? [];
  const requiredLensId = lastLoggedFrame?.lens_id ?? roll.default_lens_id;
  if (!lenses.some((l) => l.id === requiredLensId)) {
    const { data: fallbackLens } = await supabase
      .from("lenses")
      .select("*")
      .eq("id", requiredLensId)
      .maybeSingle();
    if (fallbackLens) lenses = [fallbackLens, ...lenses];
  }

  const nextFrameNumber = (latestFrame?.frame_number ?? 0) + 1;

  const title = generateRollTitle({
    startDate: roll.start_date,
    endDate: roll.end_date,
    filmStockName: filmStock?.name ?? "Unknown film",
    customTitle: roll.custom_title,
  });

  return (
    <div>
      <div className="mx-auto max-w-md">
        <Link
          href={`/rolls/${roll.id}`}
          className="text-xs text-muted hover:text-foreground"
        >
          ← {title}
        </Link>
      </div>

      <div className="mt-6">
        <ActiveRollShooter
          roll={roll}
          camera={camera}
          lenses={lenses}
          lastLoggedFrame={lastLoggedFrame ?? null}
          lastSavedFrame={latestFrame ?? null}
          nextFrameNumber={nextFrameNumber}
        />
      </div>
    </div>
  );
}

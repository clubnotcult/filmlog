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

  const [{ data: camera }, { data: activeLenses }, { data: filmStock }, { data: frames }] =
    await Promise.all([
      supabase.from("cameras").select("*").eq("id", roll.camera_id).single(),
      supabase.from("lenses").select("*").eq("active", true).order("name", { ascending: true }),
      supabase.from("film_stocks").select("name").eq("id", roll.film_stock_id).single(),
      // Every frame — Previous/Next navigation moves through the whole roll
      // client-side, so the full history needs to be on hand up front rather
      // than fetched one frame at a time as the person navigates.
      supabase
        .from("frames")
        .select("*")
        .eq("roll_id", roll.id)
        .order("frame_number", { ascending: true }),
    ]);

  if (!camera) notFound();

  const frameList = frames ?? [];

  // Every lens any frame actually used (or the roll's default) must be
  // representable even if it's since been deactivated — otherwise reviewing
  // an older frame would silently show no lens for gear that really was
  // mounted at the time.
  let lenses: Lens[] = activeLenses ?? [];
  const requiredLensIds = new Set(
    [roll.default_lens_id, ...frameList.map((f) => f.lens_id)].filter(
      (v): v is string => v !== null,
    ),
  );
  const missingLensIds = [...requiredLensIds].filter(
    (lensId) => !lenses.some((l) => l.id === lensId),
  );
  if (missingLensIds.length > 0) {
    const { data: fallbackLenses } = await supabase
      .from("lenses")
      .select("*")
      .in("id", missingLensIds);
    if (fallbackLenses) lenses = [...fallbackLenses, ...lenses];
  }

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
        <ActiveRollShooter roll={roll} camera={camera} lenses={lenses} frames={frameList} />
      </div>
    </div>
  );
}

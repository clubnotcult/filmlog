import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateRollTitle } from "@/lib/roll-title";
import { PagePlaceholder } from "@/components/page-placeholder";

export default async function ActiveRollIndexPage() {
  const supabase = await createClient();

  const { data: activeRolls } = await supabase
    .from("rolls")
    .select("*, film_stocks(name), cameras(name)")
    .eq("status", "active")
    .order("start_date", { ascending: false });

  if (!activeRolls || activeRolls.length === 0) {
    return (
      <PagePlaceholder
        title="Active Roll"
        description="You don't have a roll in progress right now."
        phase={
          <>
            <Link href="/rolls/new" className="text-accent hover:underline">
              Start a roll
            </Link>{" "}
            to begin shooting.
          </>
        }
      />
    );
  }

  if (activeRolls.length === 1) {
    redirect(`/active-roll/${activeRolls[0].id}`);
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">
        ACTIVE ROLLS
      </h1>
      <p className="mt-1 text-xs text-muted">
        You have more than one roll in progress — choose which to continue.
      </p>

      <ul className="mt-4 space-y-2">
        {activeRolls.map((roll) => {
          const filmStockName =
            (roll.film_stocks as { name: string } | null)?.name ?? "Unknown film";
          const cameraName =
            (roll.cameras as { name: string } | null)?.name ?? "Unknown camera";
          const title = generateRollTitle({
            startDate: roll.start_date,
            endDate: roll.end_date,
            filmStockName,
            customTitle: roll.custom_title,
          });
          return (
            <li key={roll.id}>
              <Link
                href={`/active-roll/${roll.id}`}
                className="block rounded-md border border-border px-4 py-3 hover:border-accent"
              >
                <p className="font-medium text-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted">
                  {cameraName} · Frame {roll.current_frame}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

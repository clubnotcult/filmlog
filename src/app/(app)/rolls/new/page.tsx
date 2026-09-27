import Link from "next/link";
import { RollForm } from "@/components/roll-form";
import { createClient } from "@/lib/supabase/server";
import { createRoll } from "../actions";

export default async function NewRollPage() {
  const supabase = await createClient();

  const [{ data: filmStocks }, { data: inventoryItems }, { data: cameras }, { data: lenses }] =
    await Promise.all([
      supabase
        .from("film_stocks")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("film_inventory_items")
        .select("*")
        .gt("quantity", 0)
        .order("created_at", { ascending: true }),
      supabase
        .from("cameras")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("lenses")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true }),
    ]);

  // Only film stocks that currently have an in-stock inventory item are worth
  // offering — a film stock with zero available physical items can't start a
  // roll anyway, so surface that as guidance rather than a dead-end select.
  const inStockFilmStockIds = new Set((inventoryItems ?? []).map((i) => i.film_stock_id));
  const shootableFilmStocks = (filmStocks ?? []).filter((f) => inStockFilmStockIds.has(f.id));

  const missing: { label: string; href: string }[] = [];
  if (shootableFilmStocks.length === 0) {
    missing.push({
      label: "film stock with an in-stock inventory item",
      href: (filmStocks ?? []).length === 0 ? "/inventory/film-stocks/new" : "/inventory/items/new",
    });
  }
  if (!cameras || cameras.length === 0) {
    missing.push({ label: "active camera", href: "/gear/cameras/new" });
  }
  if (!lenses || lenses.length === 0) {
    missing.push({ label: "active lens", href: "/gear/lenses/new" });
  }

  return (
    <section className="mx-auto max-w-md">
      <Link href="/rolls" className="text-xs text-muted hover:text-foreground">
        ← Rolls
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Start a Roll
      </h1>

      {missing.length > 0 ? (
        <div className="mt-6 space-y-3 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-strong">
          <p>You need at least one:</p>
          <ul className="space-y-1">
            {missing.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-accent hover:underline">
                  Add {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-6">
          <RollForm
            filmStocks={shootableFilmStocks}
            inventoryItems={inventoryItems ?? []}
            cameras={cameras!}
            lenses={lenses!}
            action={createRoll}
          />
        </div>
      )}
    </section>
  );
}

import Link from "next/link";
import { RollForm } from "@/components/roll-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewRollPage() {
  const supabase = await createClient();

  const [
    { data: filmStocks },
    { data: inventoryItems },
    { data: cameras },
    { data: lenses },
    { data: locations },
    { data: tags },
  ] = await Promise.all([
    supabase.from("film_stocks").select("*").eq("active", true).order("name", { ascending: true }),
    supabase.from("film_inventory_items").select("*").gt("quantity", 0).order("created_at", { ascending: true }),
    supabase.from("cameras").select("*").eq("active", true).order("name", { ascending: true }),
    supabase.from("lenses").select("*").eq("active", true).order("name", { ascending: true }),
    supabase.from("locations").select("name").order("name"),
    supabase.from("tags").select("name").order("name"),
  ]);

  // Only a camera and a film stock are needed. Inventory and lenses are
  // optional — a roll you shot years ago can still be archived.
  const missing: { label: string; href: string }[] = [];
  if (!filmStocks || filmStocks.length === 0) missing.push({ label: "film stock", href: "/inventory/film-stocks/new" });
  if (!cameras || cameras.length === 0) missing.push({ label: "camera", href: "/gear/cameras/new" });

  return (
    <section className="mx-auto max-w-md">
      <Link href="/rolls" className="text-xs text-muted hover:text-foreground">
        ← Library
      </Link>
      <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">New roll</h1>

      {missing.length > 0 ? (
        <div className="mt-6 space-y-3 border-l-2 border-border py-1 pl-4 text-sm text-muted-strong">
          <p>You need at least one:</p>
          <ul className="space-y-1">
            {missing.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-accent hover:underline">
                  Add a {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-6">
          <RollForm
            filmStocks={filmStocks!}
            inventoryItems={inventoryItems ?? []}
            cameras={cameras!}
            lenses={lenses ?? []}
            locationNames={(locations ?? []).map((l) => l.name)}
            tagNames={(tags ?? []).map((t) => t.name)}
          />
        </div>
      )}
    </section>
  );
}

import Link from "next/link";
import { InventoryItemForm } from "@/components/inventory-item-form";
import { createClient } from "@/lib/supabase/server";
import { createInventoryItem } from "../../actions";

export default async function NewInventoryItemPage() {
  const supabase = await createClient();
  const { data: filmStocks } = await supabase
    .from("film_stocks")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  return (
    <section className="mx-auto max-w-md">
      <Link href="/inventory" className="text-xs text-muted hover:text-foreground">
        ← Inventory
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Add Inventory Item
      </h1>
      <p className="mt-1 text-xs text-muted">
        A specific physical batch of film you own — e.g. three rolls of Portra
        400 expiring next June.
      </p>

      {!filmStocks || filmStocks.length === 0 ? (
        <div className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-strong">
          You need a film stock first.{" "}
          <Link href="/inventory/film-stocks/new" className="text-accent hover:underline">
            Add one
          </Link>
          .
        </div>
      ) : (
        <div className="mt-6">
          <InventoryItemForm
            filmStocks={filmStocks}
            action={createInventoryItem}
            submitLabel="Add inventory item"
          />
        </div>
      )}
    </section>
  );
}

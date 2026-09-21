import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryItemForm } from "@/components/inventory-item-form";
import { createClient } from "@/lib/supabase/server";
import { updateInventoryItem } from "../../../actions";

export default async function EditInventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: filmStocks }] = await Promise.all([
    supabase.from("film_inventory_items").select("*").eq("id", id).single(),
    supabase.from("film_stocks").select("*").order("name", { ascending: true }),
  ]);

  if (!item) notFound();

  const boundUpdate = updateInventoryItem.bind(null, id);

  return (
    <section className="mx-auto max-w-md">
      <Link href="/inventory" className="text-xs text-muted hover:text-foreground">
        ← Inventory
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Edit Inventory Item
      </h1>
      <div className="mt-6">
        <InventoryItemForm
          initial={item}
          filmStocks={filmStocks ?? []}
          action={boundUpdate}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}

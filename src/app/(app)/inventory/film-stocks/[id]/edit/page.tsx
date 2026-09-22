import Link from "next/link";
import { notFound } from "next/navigation";
import { FilmStockForm } from "@/components/film-stock-form";
import { createClient } from "@/lib/supabase/server";
import { updateFilmStock } from "../../../actions";

export default async function EditFilmStockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: filmStock } = await supabase
    .from("film_stocks")
    .select("*")
    .eq("id", id)
    .single();

  if (!filmStock) notFound();

  const boundUpdate = updateFilmStock.bind(null, id);

  return (
    <section className="mx-auto max-w-md">
      <Link href="/inventory" className="text-xs text-muted hover:text-foreground">
        ← Inventory
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Edit Film Stock
      </h1>
      <div className="mt-6">
        <FilmStockForm
          initial={filmStock}
          action={boundUpdate}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}

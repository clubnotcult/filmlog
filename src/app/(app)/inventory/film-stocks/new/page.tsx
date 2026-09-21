import Link from "next/link";
import { FilmStockForm } from "@/components/film-stock-form";
import { createFilmStock } from "../../actions";

export default function NewFilmStockPage() {
  return (
    <section className="mx-auto max-w-md">
      <Link href="/inventory" className="text-xs text-muted hover:text-foreground">
        ← Inventory
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Add Film Stock
      </h1>
      <div className="mt-6">
        <FilmStockForm action={createFilmStock} submitLabel="Add film stock" />
      </div>
    </section>
  );
}

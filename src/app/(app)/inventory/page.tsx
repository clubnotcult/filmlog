import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/date";
import {
  ConfirmDeleteButton,
  QuantityStepper,
  ToggleActiveButton,
} from "@/components/row-actions";
import {
  adjustFilmStockQuantity,
  deleteFilmStock,
  setFilmStockActive,
} from "./actions";

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data: filmStocks } = await supabase
    .from("film_stocks")
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">
          INVENTORY
        </h1>
        <Link
          href="/inventory/new"
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black"
        >
          Add film stock
        </Link>
      </div>

      {!filmStocks || filmStocks.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No film stock yet. Add what you have on hand to start logging rolls.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {filmStocks.map((stock) => (
            <li
              key={stock.id}
              className={`flex items-start justify-between gap-4 px-4 py-3 ${
                stock.active ? "" : "opacity-50"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {stock.name}
                  </span>
                  {stock.iso && (
                    <span className="text-xs text-muted">ISO {stock.iso}</span>
                  )}
                  {stock.format && (
                    <span className="text-xs text-muted">{stock.format}</span>
                  )}
                  {stock.quantity === 0 && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      Out of stock
                    </span>
                  )}
                  {!stock.active && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      Inactive
                    </span>
                  )}
                </div>
                {stock.expiration_date && (
                  <p className="mt-1 text-xs text-muted">
                    Expires {formatLongDate(stock.expiration_date)}
                  </p>
                )}
                {stock.storage_notes && (
                  <p className="mt-1 text-xs text-muted">{stock.storage_notes}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-3">
                <QuantityStepper
                  quantity={stock.quantity}
                  onDecrement={adjustFilmStockQuantity.bind(null, stock.id, -1)}
                  onIncrement={adjustFilmStockQuantity.bind(null, stock.id, 1)}
                />
                <div className="flex gap-2">
                  <Link
                    href={`/inventory/${stock.id}/edit`}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-strong hover:text-foreground"
                  >
                    Edit
                  </Link>
                  <ToggleActiveButton
                    action={setFilmStockActive.bind(null, stock.id, !stock.active)}
                    active={stock.active}
                  />
                  <ConfirmDeleteButton
                    action={deleteFilmStock.bind(null, stock.id)}
                    itemLabel={stock.name}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

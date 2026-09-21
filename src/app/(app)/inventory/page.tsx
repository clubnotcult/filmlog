import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/date";
import {
  ConfirmDeleteButton,
  QuantityStepper,
  ToggleActiveButton,
} from "@/components/row-actions";
import {
  adjustInventoryItemQuantity,
  deleteFilmStock,
  deleteInventoryItem,
  setFilmStockActive,
} from "./actions";

export default async function InventoryPage() {
  const supabase = await createClient();

  const [{ data: filmStocks }, { data: items }] = await Promise.all([
    supabase
      .from("film_stocks")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("film_inventory_items")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const filmStockById = new Map((filmStocks ?? []).map((f) => [f.id, f]));

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section>
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">
            FILM STOCKS
          </h1>
          <Link
            href="/inventory/film-stocks/new"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black"
          >
            Add film stock
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted">
          The reusable film type — entered once, reused every time you get more.
        </p>

        {!filmStocks || filmStocks.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No film stocks yet.</p>
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
                    {!stock.active && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Link
                    href={`/inventory/film-stocks/${stock.id}/edit`}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-strong hover:text-foreground"
                  >
                    Edit
                  </Link>
                  <div className="flex gap-2">
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
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">
            INVENTORY ITEMS
          </h1>
          <Link
            href="/inventory/items/new"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black"
          >
            Add inventory item
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted">
          Physical rolls you own — quantity, expiration, and storage for a
          specific batch of a film stock above.
        </p>

        {!items || items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No inventory yet. Add a physical batch of film you have on hand.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {items.map((item) => {
              const stock = filmStockById.get(item.film_stock_id);
              return (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {stock?.name ?? "Unknown film stock"}
                      </span>
                      {stock?.iso && (
                        <span className="text-xs text-muted">ISO {stock.iso}</span>
                      )}
                      {item.quantity === 0 && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          Out of stock
                        </span>
                      )}
                    </div>
                    {item.expiration_date && (
                      <p className="mt-1 text-xs text-muted">
                        Expires {formatLongDate(item.expiration_date)}
                      </p>
                    )}
                    {item.storage_notes && (
                      <p className="mt-1 text-xs text-muted">{item.storage_notes}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-3">
                    <QuantityStepper
                      quantity={item.quantity}
                      onDecrement={adjustInventoryItemQuantity.bind(null, item.id, -1)}
                      onIncrement={adjustInventoryItemQuantity.bind(null, item.id, 1)}
                    />
                    <div className="flex gap-2">
                      <Link
                        href={`/inventory/items/${item.id}/edit`}
                        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-strong hover:text-foreground"
                      >
                        Edit
                      </Link>
                      <ConfirmDeleteButton
                        action={deleteInventoryItem.bind(null, item.id)}
                        itemLabel={`this ${stock?.name ?? "inventory"} item`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { TextTabs } from "@/components/tabs";
import { createClient } from "@/lib/supabase/server";
import { formatLongDate, expirationUrgency } from "@/lib/date";
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
import type { FilmInventoryItem, FilmStock } from "@/lib/database.types";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const showCatalog = tab === "catalog";

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

  const stockById = new Map((filmStocks ?? []).map((f) => [f.id, f]));
  const itemsByStock = new Map<string, FilmInventoryItem[]>();
  for (const item of items ?? []) {
    const list = itemsByStock.get(item.film_stock_id) ?? [];
    list.push(item);
    itemsByStock.set(item.film_stock_id, list);
  }

  // What's actually in stock: only film stocks with at least one available
  // unit, so discontinued/empty stocks don't dominate the view you check
  // most often.
  const inStockGroups = [...itemsByStock.entries()]
    .map(([stockId, stockItems]) => ({
      stock: stockById.get(stockId),
      items: stockItems,
      total: stockItems.reduce((sum, i) => sum + i.quantity, 0),
    }))
    .filter((g) => g.total > 0)
    .sort((a, b) => (a.stock?.name ?? "").localeCompare(b.stock?.name ?? ""));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-light tracking-tight text-foreground">INVENTORY</h1>
      <TextTabs
        items={[
          { href: "/inventory", label: "In stock", active: !showCatalog },
          { href: "/inventory?tab=catalog", label: "Film catalog", active: showCatalog },
        ]}
      />

      {!showCatalog ? (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="label">
              IN STOCK
            </h2>
            <Link
              href="/inventory/items/new"
              className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
            >
              Add inventory
            </Link>
          </div>

          {inStockGroups.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Nothing in stock.{" "}
              <Link href="/inventory/items/new" className="text-accent hover:underline">
                Add a batch of film you have on hand
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 border-t border-border">
              {inStockGroups.map((group) => (
                <li key={group.stock?.id ?? "unknown"} className="border-b border-border">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 marker:content-none">
                      <span className="min-w-0 truncate text-base text-foreground">
                        {group.stock?.name ?? "Unknown film stock"}
                        {group.stock?.iso && (
                          <span className="numeral ml-3 text-xs text-muted">
                            ISO {group.stock.iso}
                          </span>
                        )}
                      </span>
                      <span className="numeral shrink-0 text-3xl font-light leading-none text-foreground">
                        {group.total}
                      </span>
                    </summary>

                    <div className="divide-y divide-border border-t border-border">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-4 py-3 pl-1"
                        >
                          <div className="min-w-0 text-xs text-muted">
                            {item.expiration_date && (
                              <p
                                className={
                                  expirationUrgency(item.expiration_date) === "expired"
                                    ? "text-danger"
                                    : expirationUrgency(item.expiration_date) === "soon"
                                      ? "text-accent"
                                      : undefined
                                }
                              >
                                {expirationUrgency(item.expiration_date) === "expired"
                                  ? "Expired "
                                  : "Expires "}
                                {formatLongDate(item.expiration_date)}
                              </p>
                            )}
                            {item.storage_notes && <p className="mt-0.5">{item.storage_notes}</p>}
                            {!item.expiration_date && !item.storage_notes && (
                              <p>No expiration or storage notes</p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <QuantityStepper
                              quantity={item.quantity}
                              onDecrement={adjustInventoryItemQuantity.bind(null, item.id, -1)}
                              onIncrement={adjustInventoryItemQuantity.bind(null, item.id, 1)}
                            />
                            <div className="flex gap-2">
                              <Link
                                href={`/inventory/items/${item.id}/edit`}
                                className="label flex h-10 items-center px-1 !text-muted-strong hover:!text-foreground"
                              >
                                Edit
                              </Link>
                              <ConfirmDeleteButton
                                action={deleteInventoryItem.bind(null, item.id)}
                                itemLabel={`this ${group.stock?.name ?? "inventory"} item`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <FilmCatalog filmStocks={filmStocks ?? []} />
      )}
    </div>
  );
}

function FilmCatalog({ filmStocks }: { filmStocks: FilmStock[] }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="label">
          FILM CATALOG
        </h2>
        <Link
          href="/inventory/film-stocks/new"
          className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black"
        >
          Add film stock
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted">
        The reusable film type — entered once, reused every time you get more.
      </p>

      {filmStocks.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No film stocks yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {filmStocks.map((stock) => (
            <li
              key={stock.id}
              className={`flex items-start justify-between gap-4 px-4 py-3 ${
                stock.active ? "" : "opacity-50"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{stock.name}</span>
                  {stock.iso && <span className="text-xs text-muted">ISO {stock.iso}</span>}
                  {stock.format && <span className="text-xs text-muted">{stock.format}</span>}
                  {!stock.active && (
                    <span className="label">
                      Inactive
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <Link
                  href={`/inventory/film-stocks/${stock.id}/edit`}
                  className="label flex h-10 items-center px-1 !text-muted-strong hover:!text-foreground"
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
  );
}

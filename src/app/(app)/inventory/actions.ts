"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { RowActionState } from "@/components/row-actions";

export type FormState = { error: string | null };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

export async function createFilmStock(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = str(formData, "name");
  if (!name) return { error: "Name is required." };

  const isoRaw = str(formData, "iso");
  const iso = isoRaw ? Number(isoRaw) : null;
  if (iso !== null && (Number.isNaN(iso) || iso <= 0)) {
    return { error: "ISO must be a positive number." };
  }

  const quantityRaw = str(formData, "quantity");
  const quantity = quantityRaw ? Number(quantityRaw) : 0;
  if (Number.isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
    return { error: "Quantity must be a whole number, zero or more." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("film_stocks").insert({
    name,
    iso,
    format: optStr(formData, "format"),
    quantity,
    expiration_date: optStr(formData, "expiration_date"),
    storage_notes: optStr(formData, "storage_notes"),
  });

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function updateFilmStock(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = str(formData, "name");
  if (!name) return { error: "Name is required." };

  const isoRaw = str(formData, "iso");
  const iso = isoRaw ? Number(isoRaw) : null;
  if (iso !== null && (Number.isNaN(iso) || iso <= 0)) {
    return { error: "ISO must be a positive number." };
  }

  const quantityRaw = str(formData, "quantity");
  const quantity = quantityRaw ? Number(quantityRaw) : 0;
  if (Number.isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
    return { error: "Quantity must be a whole number, zero or more." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("film_stocks")
    .update({
      name,
      iso,
      format: optStr(formData, "format"),
      quantity,
      expiration_date: optStr(formData, "expiration_date"),
      storage_notes: optStr(formData, "storage_notes"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function deleteFilmStock(id: string): Promise<RowActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("film_stocks").delete().eq("id", id);
  if (error) {
    return { error: friendlyDbError(error, { entityInUse: "film stock" }) };
  }
  revalidatePath("/inventory");
  return { error: null };
}

export async function setFilmStockActive(
  id: string,
  active: boolean,
): Promise<RowActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("film_stocks")
    .update({ active })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/inventory");
  return { error: null };
}

/**
 * Adjusts quantity by a signed delta (e.g. +1 / -1 from the inventory list).
 * This calls the `adjust_film_stock_quantity` RPC, which performs the
 * read-modify-write as a single atomic UPDATE (see the migration) rather than
 * reading the current value here and writing it back — avoiding a race
 * between overlapping requests. The `quantity >= 0` check constraint remains
 * the hard backstop either way.
 */
export async function adjustFilmStockQuantity(
  id: string,
  delta: number,
): Promise<RowActionState> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("adjust_film_stock_quantity", {
    p_id: id,
    p_delta: delta,
  });

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/inventory");
  return { error: null };
}

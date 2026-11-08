"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseFilmCardDesign, type FilmCardDesign } from "@/lib/film-card";
import { friendlyDbError } from "@/lib/db-errors";
import { isFilmFormat, isFilmType, type FilmFormat, type FilmType } from "@/lib/film-classification";
import type { RowActionState } from "@/components/row-actions";

export type FormState = { error: string | null };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Film stocks (the reusable TYPE — name/ISO/format, entered once per film)
// ---------------------------------------------------------------------------

/**
 * Reads the structured classification fields. Both are required and must be
 * one of the controlled values — free text is rejected, so the archive's tags,
 * filters and exports stay consistent.
 */
function readClassification(
  formData: FormData,
): { ok: true; format: FilmFormat; filmType: FilmType } | { ok: false; error: string } {
  const format = str(formData, "format");
  const filmType = str(formData, "film_type");
  if (!isFilmFormat(format)) return { ok: false, error: "Choose a film format." };
  if (!isFilmType(filmType)) return { ok: false, error: "Choose a film type." };
  return { ok: true, format, filmType };
}

/**
 * The submitted film card, validated into the stored structure. An empty or
 * colorless value means "no custom card" (null), never a generated one.
 */
function readCardDesign(formData: FormData): FilmCardDesign | null {
  return parseFilmCardDesign(str(formData, "card_design"));
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

  const classification = readClassification(formData);
  if (!classification.ok) return { error: classification.error };

  const supabase = await createClient();
  const { error } = await supabase.from("film_stocks").insert({
    name,
    iso,
    format: classification.format,
    film_type: classification.filmType,
    card_design: readCardDesign(formData),
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

  const classification = readClassification(formData);
  if (!classification.ok) return { error: classification.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("film_stocks")
    .update({
      name,
      iso,
      format: classification.format,
      film_type: classification.filmType,
      card_design: readCardDesign(formData),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/inventory");
  revalidatePath("/rolls");
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

// ---------------------------------------------------------------------------
// Inventory items (a specific physical batch of a film stock you own)
// ---------------------------------------------------------------------------

export async function createInventoryItem(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const filmStockId = str(formData, "film_stock_id");
  if (!filmStockId) return { error: "Select a film stock." };

  const quantityRaw = str(formData, "quantity");
  const quantity = quantityRaw ? Number(quantityRaw) : 0;
  if (Number.isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
    return { error: "Quantity must be a whole number, zero or more." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("film_inventory_items").insert({
    film_stock_id: filmStockId,
    quantity,
    expiration_date: optStr(formData, "expiration_date"),
    storage_notes: optStr(formData, "storage_notes"),
  });

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function updateInventoryItem(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const filmStockId = str(formData, "film_stock_id");
  if (!filmStockId) return { error: "Select a film stock." };

  const quantityRaw = str(formData, "quantity");
  const quantity = quantityRaw ? Number(quantityRaw) : 0;
  if (Number.isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
    return { error: "Quantity must be a whole number, zero or more." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("film_inventory_items")
    .update({
      film_stock_id: filmStockId,
      quantity,
      expiration_date: optStr(formData, "expiration_date"),
      storage_notes: optStr(formData, "storage_notes"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function deleteInventoryItem(id: string): Promise<RowActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("film_inventory_items")
    .delete()
    .eq("id", id);
  if (error) {
    return { error: friendlyDbError(error, { entityInUse: "inventory item" }) };
  }
  revalidatePath("/inventory");
  return { error: null };
}

/**
 * Adjusts quantity by a signed delta (e.g. +1 / -1 from the inventory list).
 * Calls the `adjust_film_inventory_item_quantity` RPC, which performs the
 * read-modify-write as a single atomic UPDATE (see the migration) rather than
 * reading the current value here and writing it back.
 */
export async function adjustInventoryItemQuantity(
  id: string,
  delta: number,
): Promise<RowActionState> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("adjust_film_inventory_item_quantity", {
    p_id: id,
    p_delta: delta,
  });

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/inventory");
  return { error: null };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

import { friendlyDbError } from "@/lib/db-errors";
import type { Roll } from "@/lib/database.types";

export type FormState = { error: string | null };

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

export async function createRoll(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const filmInventoryItemId = str(formData, "film_inventory_item_id");
  const cameraId = str(formData, "camera_id");
  const defaultLensId = str(formData, "default_lens_id");
  const startDate = str(formData, "start_date");

  if (!filmInventoryItemId) return { error: "Select an inventory item." };
  if (!cameraId) return { error: "Select a camera." };
  if (!defaultLensId) return { error: "Select a default lens." };
  if (!startDate) return { error: "Start date is required." };

  const supabase = await createClient();

  // A single RPC call: decrements the inventory item's quantity and inserts
  // the roll as one atomic transaction (see supabase/migrations for
  // create_roll). If either step fails — including "no inventory left" —
  // nothing is written.
  const { data: roll, error } = await supabase.rpc("create_roll", {
    p_film_inventory_item_id: filmInventoryItemId,
    p_camera_id: cameraId,
    p_default_lens_id: defaultLensId,
    p_start_date: startDate,
    p_custom_title: optStr(formData, "custom_title"),
    p_notes: optStr(formData, "notes"),
  });

  if (error) return { error: error.message };
  if (!roll) return { error: "Something went wrong creating the roll." };

  revalidatePath("/rolls");
  revalidatePath("/inventory");
  redirect(`/rolls/${roll.id}`);
}

/** completed -> archived. */
export async function archiveRoll(rollId: string): Promise<ActionResult<Roll>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_roll", { p_roll_id: rollId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong archiving the roll." };

  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);
  return { ok: true, data };
}

/** archived -> completed. */
export async function restoreRoll(rollId: string): Promise<ActionResult<Roll>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_roll", { p_roll_id: rollId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong restoring the roll." };

  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);
  return { ok: true, data };
}

/**
 * Permanently deletes a roll and, via the existing frames.roll_id ON DELETE
 * CASCADE (Phase 1 schema), every frame record that belongs to it. This is
 * only ever reachable from the roll detail page — see DeleteRollMenu — never
 * from the Active Roll shooting screen. Never touches Google Drive; there is
 * no Drive integration to call yet, and this only ever issues a Postgres
 * DELETE against our own tables.
 *
 * confirmationText must be exactly "DELETE" — the same requirement the UI
 * enforces before this is ever called, checked again here so a client bug or
 * a crafted request can't skip the safeguard.
 */
export async function deleteRoll(
  rollId: string,
  confirmationText: string,
): Promise<ActionResult<true>> {
  if (confirmationText !== "DELETE") {
    return { ok: false, error: 'Type "DELETE" exactly to confirm.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("rolls").delete().eq("id", rollId);
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath("/rolls");
  return { ok: true, data: true };
}

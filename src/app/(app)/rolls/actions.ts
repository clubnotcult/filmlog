"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null };

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

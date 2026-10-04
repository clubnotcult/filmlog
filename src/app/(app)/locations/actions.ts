"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { Location } from "@/lib/database.types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listLocations(): Promise<Location[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("*").order("name");
  return data ?? [];
}

/** Create-or-reuse by name — the same path Active Roll and frame editing use to set a frame's location. */
export async function getOrCreateLocation(name: string): Promise<ActionResult<Location>> {
  if (!name.trim()) return { ok: false, error: "Location name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_create_location", { p_name: name });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong creating the location." };
  revalidatePath("/locations");
  return { ok: true, data };
}

export async function renameLocation(id: string, name: string): Promise<ActionResult<Location>> {
  if (!name.trim()) return { ok: false, error: "Location name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .update({ name: name.trim() })
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong renaming the location." };
  revalidatePath("/locations");
  return { ok: true, data };
}

/** Deleting a location clears it from any frames (ON DELETE SET NULL) rather than touching the frames themselves. */
export async function deleteLocation(id: string): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/locations");
  return { ok: true, data: true };
}

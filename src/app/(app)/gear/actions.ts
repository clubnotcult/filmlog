"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { parseApertureStops, parseShutterSpeeds } from "@/lib/gear-values";
import { METER_TYPES, type MeterType } from "@/lib/database.types";
import type { RowActionState } from "@/components/row-actions";

export type FormState = { error: string | null };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

function optMeterType(formData: FormData, key: string): MeterType | null {
  const value = str(formData, key);
  return (METER_TYPES as string[]).includes(value) ? (value as MeterType) : null;
}

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------

export async function createCamera(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = str(formData, "name");
  const shutterSpeeds = parseShutterSpeeds(str(formData, "shutter_speeds"));

  if (!name) return { error: "Name is required." };
  if (shutterSpeeds.length === 0) {
    return { error: "Add at least one shutter speed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cameras").insert({
    name,
    format: optStr(formData, "format"),
    notes: optStr(formData, "notes"),
    shutter_speeds: shutterSpeeds,
    default_meter_type: optMeterType(formData, "default_meter_type"),
  });

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/gear");
  redirect("/gear");
}

export async function updateCamera(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = str(formData, "name");
  const shutterSpeeds = parseShutterSpeeds(str(formData, "shutter_speeds"));

  if (!name) return { error: "Name is required." };
  if (shutterSpeeds.length === 0) {
    return { error: "Add at least one shutter speed." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cameras")
    .update({
      name,
      format: optStr(formData, "format"),
      notes: optStr(formData, "notes"),
      shutter_speeds: shutterSpeeds,
      default_meter_type: optMeterType(formData, "default_meter_type"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/gear");
  redirect("/gear");
}

export async function deleteCamera(id: string): Promise<RowActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("cameras").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error, { entityInUse: "camera" }) };
  revalidatePath("/gear");
  return { error: null };
}

export async function setCameraActive(
  id: string,
  active: boolean,
): Promise<RowActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cameras")
    .update({ active })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/gear");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Lenses
// ---------------------------------------------------------------------------

export async function createLens(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = str(formData, "name");
  const apertureStops = parseApertureStops(str(formData, "aperture_stops"));

  if (!name) return { error: "Name is required." };
  if (apertureStops.length === 0) {
    return { error: "Add at least one aperture stop." };
  }

  const minRaw = str(formData, "min_aperture");
  const maxRaw = str(formData, "max_aperture");
  const minAperture = minRaw ? Number(minRaw) : Math.min(...apertureStops);
  const maxAperture = maxRaw ? Number(maxRaw) : Math.max(...apertureStops);

  const supabase = await createClient();
  const { error } = await supabase.from("lenses").insert({
    name,
    focal_length: optStr(formData, "focal_length"),
    notes: optStr(formData, "notes"),
    aperture_stops: apertureStops,
    min_aperture: Number.isNaN(minAperture) ? null : minAperture,
    max_aperture: Number.isNaN(maxAperture) ? null : maxAperture,
  });

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/gear");
  redirect("/gear");
}

export async function updateLens(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = str(formData, "name");
  const apertureStops = parseApertureStops(str(formData, "aperture_stops"));

  if (!name) return { error: "Name is required." };
  if (apertureStops.length === 0) {
    return { error: "Add at least one aperture stop." };
  }

  const minRaw = str(formData, "min_aperture");
  const maxRaw = str(formData, "max_aperture");
  const minAperture = minRaw ? Number(minRaw) : Math.min(...apertureStops);
  const maxAperture = maxRaw ? Number(maxRaw) : Math.max(...apertureStops);

  const supabase = await createClient();
  const { error } = await supabase
    .from("lenses")
    .update({
      name,
      focal_length: optStr(formData, "focal_length"),
      notes: optStr(formData, "notes"),
      aperture_stops: apertureStops,
      min_aperture: Number.isNaN(minAperture) ? null : minAperture,
      max_aperture: Number.isNaN(maxAperture) ? null : maxAperture,
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/gear");
  redirect("/gear");
}

export async function deleteLens(id: string): Promise<RowActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("lenses").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error, { entityInUse: "lens" }) };
  revalidatePath("/gear");
  return { error: null };
}

export async function setLensActive(
  id: string,
  active: boolean,
): Promise<RowActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lenses")
    .update({ active })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/gear");
  return { error: null };
}

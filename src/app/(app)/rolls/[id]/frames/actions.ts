"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { Frame, MeterType } from "@/lib/database.types";
import { METER_TYPES } from "@/lib/database.types";

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

function optMeterType(formData: FormData, key: string): MeterType | null {
  const value = str(formData, key);
  return (METER_TYPES as string[]).includes(value) ? (value as MeterType) : null;
}

/**
 * Edits a saved (historical) frame via the update_frame RPC. A frame is a
 * single independent row — this can only ever change the one row identified
 * by frameId, so it can never affect any other frame's data or the roll's
 * current shooting state.
 *
 * The same aperture-belongs-to-lens rule enforced while shooting is enforced
 * here too, server-side, not just by the form's own field filtering.
 *
 * If returnTo is present (used by the Active Roll "fix previous frame" fast
 * correction flow), redirects there instead of the frame's own detail page —
 * validated as a same-origin relative path to avoid an open redirect, since
 * it arrives as ordinary form data.
 */
export async function updateFrame(
  rollId: string,
  frameId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const metadataLogged = str(formData, "metadata_logged") === "true";
  const returnToRaw = optStr(formData, "return_to");
  const returnTo = returnToRaw && returnToRaw.startsWith("/") ? returnToRaw : null;
  const supabase = await createClient();

  if (!metadataLogged) {
    const { error } = await supabase.rpc("update_frame", {
      p_frame_id: frameId,
      p_metadata_logged: false,
      p_notes: optStr(formData, "notes"),
    });
    if (error) return { error: friendlyDbError(error) };
  } else {
    const shutterSpeed = str(formData, "shutter_speed");
    const apertureRaw = str(formData, "aperture");
    const lensId = str(formData, "lens_id");

    if (!shutterSpeed) return { error: "Shutter speed is required." };
    if (!apertureRaw) return { error: "Aperture is required." };
    if (!lensId) return { error: "Lens is required." };

    const aperture = Number(apertureRaw);
    if (Number.isNaN(aperture)) return { error: "Aperture must be a number." };

    const pushRaw = str(formData, "push_pull");
    const pushPull = pushRaw ? Number(pushRaw) : 0;
    if (Number.isNaN(pushPull)) return { error: "Push/pull must be a number." };

    const { error } = await supabase.rpc("update_frame", {
      p_frame_id: frameId,
      p_metadata_logged: true,
      p_shutter_speed: shutterSpeed,
      p_aperture: aperture,
      p_lens_id: lensId,
      p_push_pull: pushPull,
      p_notes: optStr(formData, "notes"),
      p_meter_type: optMeterType(formData, "meter_type"),
    });
    if (error) return { error: friendlyDbError(error) };
  }

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  if (returnTo) revalidatePath(returnTo);
  redirect(returnTo ?? `/rolls/${rollId}/frames/${frameId}`);
}

/**
 * Same underlying update_frame RPC as `updateFrame` above, called with plain
 * arguments instead of FormData and returning the updated row instead of
 * redirecting — for the Active Roll screen's inline "review an existing
 * frame and save an edit" flow (Phase 6B), which manages its own frame list
 * in memory rather than navigating to a page.
 */
export async function updateFrameFields(
  rollId: string,
  frameId: string,
  input: {
    metadataLogged: boolean;
    shutterSpeed: string | null;
    aperture: number | null;
    lensId: string | null;
    pushPull: number | null;
    notes: string | null;
    meterType: MeterType | null;
  },
): Promise<ActionResult<Frame>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_frame", {
    p_frame_id: frameId,
    p_metadata_logged: input.metadataLogged,
    p_shutter_speed: input.metadataLogged ? input.shutterSpeed : null,
    p_aperture: input.metadataLogged ? input.aperture : null,
    p_lens_id: input.metadataLogged ? input.lensId : null,
    p_push_pull: input.metadataLogged ? input.pushPull : null,
    p_notes: input.notes,
    p_meter_type: input.metadataLogged ? input.meterType : null,
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong saving the frame." };

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  revalidatePath(`/active-roll/${rollId}`);

  return { ok: true, data };
}

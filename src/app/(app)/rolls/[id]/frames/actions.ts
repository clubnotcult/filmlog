"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

export type FormState = { error: string | null };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

/**
 * Edits a saved (historical) frame via the update_frame RPC. A frame is a
 * single independent row — this can only ever change the one row identified
 * by frameId, so it can never affect any other frame's data or the roll's
 * current shooting state.
 *
 * The same aperture-belongs-to-lens rule enforced while shooting is enforced
 * here too, server-side, not just by the form's own field filtering.
 */
export async function updateFrame(
  rollId: string,
  frameId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const metadataLogged = str(formData, "metadata_logged") === "true";
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
    });
    if (error) return { error: friendlyDbError(error) };
  }

  revalidatePath(`/rolls/${rollId}`);
  revalidatePath(`/rolls/${rollId}/frames/${frameId}`);
  redirect(`/rolls/${rollId}/frames/${frameId}`);
}

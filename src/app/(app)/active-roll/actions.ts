"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { Frame, Roll } from "@/lib/database.types";

export type SaveFrameInput = {
  metadataLogged: boolean;
  shutterSpeed: string | null;
  aperture: number | null;
  lensId: string | null;
  pushPull: number | null;
  notes: string | null;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Saves the current frame and advances the roll, via the save_frame_and_advance
 * RPC (see migrations): locks the roll row, computes the next frame number
 * from the frames table itself, validates required fields (for logged
 * frames), and inserts — all atomically. If this returns an error, nothing
 * was written and the frame must not advance client-side.
 *
 * When metadataLogged is false ("No Input Logged"), the RPC ignores whatever
 * exposure values were passed and forces them all to null server-side — the
 * frame still gets a real frame number (it was shot; it exists), but never a
 * fabricated-looking exposure.
 */
export async function saveFrameAndAdvance(
  rollId: string,
  input: SaveFrameInput,
): Promise<ActionResult<Frame>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("save_frame_and_advance", {
    p_roll_id: rollId,
    p_shutter_speed: input.shutterSpeed,
    p_aperture: input.aperture,
    p_lens_id: input.lensId,
    p_push_pull: input.pushPull,
    p_notes: input.notes,
    p_metadata_logged: input.metadataLogged,
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong saving the frame." };

  revalidatePath(`/active-roll/${rollId}`);
  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);

  return { ok: true, data };
}

/**
 * Marks a roll complete. The two-step "are you sure" confirmation and any
 * pending-frame handling are client-side UI concerns (FinishRollMenu) — by
 * the time this is called, the user has already made those choices.
 */
export async function finishRoll(rollId: string): Promise<ActionResult<Roll>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("finish_roll", {
    p_roll_id: rollId,
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong finishing the roll." };

  revalidatePath(`/active-roll/${rollId}`);
  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/active-roll");

  return { ok: true, data };
}

/**
 * Reopens a completed roll for continued shooting. current_frame is
 * recomputed server-side from the frames table (next unsaved frame number).
 */
export async function reopenRoll(rollId: string): Promise<ActionResult<Roll>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reopen_roll", {
    p_roll_id: rollId,
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Something went wrong reopening the roll." };

  revalidatePath(`/active-roll/${rollId}`);
  revalidatePath("/rolls");
  revalidatePath(`/rolls/${rollId}`);
  revalidatePath("/active-roll");

  return { ok: true, data };
}

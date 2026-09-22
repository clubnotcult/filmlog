import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FrameEditForm } from "@/components/frame-edit-form";
import { updateFrame } from "../../actions";
import type { Lens } from "@/lib/database.types";

export default async function FrameEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; frameId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id: rollId, frameId } = await params;
  const { returnTo: returnToRaw } = await searchParams;
  const returnTo = returnToRaw && returnToRaw.startsWith("/") ? returnToRaw : undefined;
  const supabase = await createClient();

  const { data: frame } = await supabase
    .from("frames")
    .select("*")
    .eq("id", frameId)
    .eq("roll_id", rollId)
    .single();

  if (!frame) notFound();

  const { data: roll } = await supabase
    .from("rolls")
    .select("camera_id, default_lens_id")
    .eq("id", rollId)
    .single();

  if (!roll) notFound();

  const [{ data: camera }, { data: activeLenses }] = await Promise.all([
    supabase.from("cameras").select("*").eq("id", roll.camera_id).single(),
    supabase.from("lenses").select("*").eq("active", true).order("name", { ascending: true }),
  ]);

  if (!camera) notFound();

  // The frame's current lens (or the roll's default) must be selectable even
  // if it's since been deactivated, same as the shooting screen.
  let lenses: Lens[] = activeLenses ?? [];
  const requiredLensId = frame.lens_id ?? roll.default_lens_id;
  if (requiredLensId && !lenses.some((l) => l.id === requiredLensId)) {
    const { data: fallbackLens } = await supabase
      .from("lenses")
      .select("*")
      .eq("id", requiredLensId)
      .maybeSingle();
    if (fallbackLens) lenses = [fallbackLens, ...lenses];
  }

  const boundUpdate = updateFrame.bind(null, rollId, frameId);

  return (
    <div className="mx-auto max-w-md">
      <Link
        href={returnTo ?? `/rolls/${rollId}/frames/${frameId}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← {returnTo ? "Back to shooting" : `Frame ${frame.frame_number}`}
      </Link>
      <h1 className="mt-2 font-mono text-lg text-foreground">
        Edit Frame {frame.frame_number}
      </h1>

      <div className="mt-6">
        <FrameEditForm
          frame={frame}
          camera={camera}
          lenses={lenses}
          action={boundUpdate}
          returnTo={returnTo}
        />
      </div>
    </div>
  );
}

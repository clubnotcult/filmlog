import Link from "next/link";
import { notFound } from "next/navigation";
import { CameraForm } from "@/components/camera-form";
import { createClient } from "@/lib/supabase/server";
import { updateCamera } from "../../../actions";

export default async function EditCameraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: camera } = await supabase
    .from("cameras")
    .select("*")
    .eq("id", id)
    .single();

  if (!camera) notFound();

  const boundUpdate = updateCamera.bind(null, id);

  return (
    <section className="mx-auto max-w-md">
      <Link href="/gear" className="text-xs text-muted hover:text-foreground">
        ← Gear
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Edit Camera
      </h1>
      <div className="mt-6">
        <CameraForm
          initial={camera}
          action={boundUpdate}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}

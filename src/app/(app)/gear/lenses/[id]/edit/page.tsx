import Link from "next/link";
import { notFound } from "next/navigation";
import { LensForm } from "@/components/lens-form";
import { createClient } from "@/lib/supabase/server";
import { updateLens } from "../../../actions";

export default async function EditLensPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: lens } = await supabase
    .from("lenses")
    .select("*")
    .eq("id", id)
    .single();

  if (!lens) notFound();

  const boundUpdate = updateLens.bind(null, id);

  return (
    <section className="mx-auto max-w-md">
      <Link href="/gear" className="text-xs text-muted hover:text-foreground">
        ← Gear
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Edit Lens
      </h1>
      <div className="mt-6">
        <LensForm
          initial={lens}
          action={boundUpdate}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}

import Link from "next/link";
import { LensForm } from "@/components/lens-form";
import { createLens } from "../../actions";

export default function NewLensPage() {
  return (
    <section className="mx-auto max-w-md">
      <Link href="/gear" className="text-xs text-muted hover:text-foreground">
        ← Gear
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Add Lens
      </h1>
      <div className="mt-6">
        <LensForm action={createLens} submitLabel="Add lens" />
      </div>
    </section>
  );
}

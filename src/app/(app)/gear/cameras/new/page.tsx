import Link from "next/link";
import { CameraForm } from "@/components/camera-form";
import { createCamera } from "../../actions";

export default function NewCameraPage() {
  return (
    <section className="mx-auto max-w-md">
      <Link href="/gear" className="text-xs text-muted hover:text-foreground">
        ← Gear
      </Link>
      <h1 className="mt-2 font-mono text-lg tracking-wide text-foreground">
        Add Camera
      </h1>
      <div className="mt-6">
        <CameraForm action={createCamera} submitLabel="Add camera" />
      </div>
    </section>
  );
}

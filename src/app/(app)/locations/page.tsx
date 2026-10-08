import Link from "next/link";
import { listLocations } from "./actions";
import { LocationsManager } from "./locations-manager";

export default async function LocationsPage() {
  const locations = await listLocations();

  return (
    <div className="mx-auto max-w-md">
      <Link href="/gear" className="label hover:!text-foreground">
        ← Gear
      </Link>
      <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Locations</h1>
      <p className="mt-2 text-sm text-muted">
        Reusable places — set on a frame in Active Roll or frame review, and
        available everywhere as a filter and a system tag.
      </p>
      <div className="mt-6">
        <LocationsManager initialLocations={locations} />
      </div>
    </div>
  );
}

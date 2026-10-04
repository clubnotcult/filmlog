import { redirect } from "next/navigation";

export default function RootPage() {
  // The Active Roll is the primary experience; send people straight there.
  redirect("/active-roll");
}

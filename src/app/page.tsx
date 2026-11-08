import { redirect } from "next/navigation";

export default function RootPage() {
  // The Library is the primary experience; the shooting log is secondary.
  redirect("/rolls");
}

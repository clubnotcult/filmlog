import Link from "next/link";

/** Shared tab bar rendered at the top of both /rolls and /explore, so switching between them reads as moving within one Library rather than jumping between separate tools. */
export function LibraryTabs({ active }: { active: "rolls" | "images" }) {
  return (
    <div>
      <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">LIBRARY</h1>
      <div className="mt-3 flex items-center gap-1 rounded-md border border-border p-1 text-sm">
        <Link
          href="/rolls"
          className={`flex-1 rounded px-3 py-1.5 text-center ${
            active === "rolls" ? "bg-accent text-black" : "text-muted hover:text-foreground"
          }`}
        >
          Rolls
        </Link>
        <Link
          href="/explore"
          className={`flex-1 rounded px-3 py-1.5 text-center ${
            active === "images" ? "bg-accent text-black" : "text-muted hover:text-foreground"
          }`}
        >
          Images
        </Link>
      </div>
    </div>
  );
}

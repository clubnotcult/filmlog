"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/active-roll", label: "Active Roll" },
  { href: "/rolls", label: "Library", matchPaths: ["/rolls", "/explore"] },
  { href: "/inventory", label: "Inventory" },
  { href: "/gear", label: "Gear" },
  { href: "/export", label: "Export" },
] as const;

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  const paths = "matchPaths" in item ? item.matchPaths : [item.href];
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="
        fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background
        pb-[env(safe-area-inset-bottom,0px)]
        md:static md:inset-auto md:h-full md:w-56 md:flex-col md:border-t-0 md:border-r md:pb-0
      "
    >
      <div className="hidden px-6 pb-8 pt-8 md:block">
        <span className="numeral text-sm uppercase tracking-[0.28em] text-foreground">
          Film&nbsp;Log
        </span>
      </div>

      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`
              relative flex h-14 flex-1 items-center justify-center
              text-[10px] font-medium uppercase tracking-[0.16em] transition-colors
              md:h-10 md:flex-none md:justify-start md:px-6 md:text-[11px]
              ${active ? "text-foreground" : "text-muted hover:text-foreground"}
            `}
          >
            {/* The notch: a short bar on the active item — the same
                "locked position" mark the dials use, so the whole app shares
                one visual answer to "where am I / what's selected". */}
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-0 h-[2px] w-6 -translate-x-1/2 bg-accent md:left-0 md:top-1/2 md:h-4 md:w-[2px] md:-translate-y-1/2 md:translate-x-0"
              />
            )}
            {item.label === "Active Roll" ? "Shoot" : item.label}
          </Link>
        );
      })}
    </nav>
  );
}

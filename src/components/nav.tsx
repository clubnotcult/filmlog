"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/active-roll", label: "Active Roll" },
  { href: "/rolls", label: "Library", matchPaths: ["/rolls", "/explore"] },
  { href: "/inventory", label: "Inventory" },
  { href: "/gear", label: "Gear" },
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
        fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface/95 backdrop-blur
        pb-[env(safe-area-inset-bottom,0px)]
        md:static md:inset-auto md:h-full md:w-56 md:flex-col md:border-t-0 md:border-r md:pb-0
      "
    >
      <div className="hidden px-5 py-6 md:block">
        <span className="font-mono text-lg tracking-[0.2em] text-foreground">
          FILM&nbsp;LOG
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
              flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs
              md:flex-none md:flex-row md:justify-start md:gap-3 md:px-5 md:py-2.5 md:text-sm
              ${
                active
                  ? "text-accent md:bg-surface-raised"
                  : "text-muted hover:text-foreground"
              }
            `}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

import Link from "next/link";

/**
 * Section tabs as type on a rule: the active one carries the same 2px signal
 * notch used everywhere else for "selected". Not a segmented control, not a
 * filled pill — a segmented box would be a container with nothing to contain.
 */
export function TextTabs({
  items,
}: {
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <div className="mt-5 flex gap-7 border-b border-border">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`relative -mb-px flex h-11 items-center text-sm transition-colors ${
            item.active ? "text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {item.label}
          {item.active && (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" />
          )}
        </Link>
      ))}
    </div>
  );
}

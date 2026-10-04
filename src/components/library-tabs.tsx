import { TextTabs } from "@/components/tabs";

/** Shared header for /rolls and /explore, so switching between them reads as moving within one Library. */
export function LibraryTabs({ active }: { active: "rolls" | "images" }) {
  return (
    <div>
      <h1 className="text-3xl font-light tracking-tight text-foreground">Library</h1>
      <TextTabs
        items={[
          { href: "/rolls", label: "Rolls", active: active === "rolls" },
          { href: "/explore", label: "Images", active: active === "images" },
        ]}
      />
    </div>
  );
}

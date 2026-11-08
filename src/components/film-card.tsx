import { cardBackground, cardTextColor, type FilmCardDesign } from "@/lib/film-card";

/**
 * A film stock's card — the small colored "box end" shown beside its rolls.
 * Pure render of the saved design; the same component draws the designer's
 * live preview, so what you see while editing is what the Library shows.
 *
 * A stock without a design gets a restrained default: a plain tile with its
 * ISO set in the same mono type the rest of the app uses — never a random or
 * generated color scheme.
 */
const SIZES = {
  sm: { box: "h-[52px] w-10", text: "text-[7px]", pad: "p-1" },
  md: { box: "h-16 w-12", text: "text-[8px]", pad: "p-1.5" },
  lg: { box: "h-40 w-[7.5rem]", text: "text-[17px]", pad: "p-3" },
} as const;

export function FilmCard({
  design,
  iso,
  name,
  size = "md",
}: {
  design: FilmCardDesign | null;
  iso: number | null;
  name: string;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];

  if (!design) {
    return (
      <div
        aria-label={`${name} film card`}
        className={`${s.box} ${s.pad} flex shrink-0 flex-col justify-end border border-border bg-surface`}
      >
        <span className={`numeral ${s.text} leading-none tracking-[0.08em] text-muted`}>
          {iso ?? "—"}
        </span>
      </div>
    );
  }

  const justify =
    design.textPosition === "top" ? "justify-start" : design.textPosition === "center" ? "justify-center" : "justify-end";

  return (
    <div
      aria-label={`${name} film card`}
      className={`${s.box} ${s.pad} flex shrink-0 flex-col overflow-hidden ${justify}`}
      style={{ background: cardBackground(design) }}
    >
      {design.text && (
        <span
          className={`numeral ${s.text} line-clamp-3 break-words font-semibold uppercase leading-[1.1] tracking-[0.06em]`}
          style={{ color: cardTextColor(design) }}
        >
          {design.text}
        </span>
      )}
    </div>
  );
}

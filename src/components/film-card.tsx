import type { CSSProperties } from "react";
import {
  CARD_LINE_HEIGHT,
  CARD_TRACKING,
  cardBackground,
  cardTextAnchor,
  cardTextColor,
  fitCardText,
  type CardText,
  type FilmCardDesign,
} from "@/lib/film-card";

/**
 * A film stock's card — the small colored "box end" shown beside its rolls.
 * Pure render of the saved design; the same component draws the designer's
 * live preview, so what you see while editing is what the Library shows.
 *
 * The card is a CSS size container and every measurement inside it is in
 * cqw (1% of the card's width), computed by fitCardText — so text fits the
 * same way at every size, on the server and in the browser alike.
 *
 * A stock without a design gets a restrained default: a plain tile with its
 * ISO set in the same mono type the rest of the app uses — never a random or
 * generated color scheme.
 */
const SIZES = {
  // All exactly 3:4, so the fitted layout is identical at each size.
  sm: { box: "h-[52px] w-[39px]", text: "text-[7px]", pad: "p-1" },
  md: { box: "h-16 w-12", text: "text-[8px]", pad: "p-1.5" },
  lg: { box: "h-40 w-[7.5rem]", text: "text-[17px]", pad: "p-3" },
} as const;

function CardTextBlock({ design, text }: { design: FilmCardDesign; text: CardText }) {
  const fit = fitCardText(text);
  const { region } = fit;
  const anchor = cardTextAnchor(text);
  const style: CSSProperties = {
    position: "absolute",
    // Centered on its region, sized to the unrotated run, then rotated about
    // its own center: after rotation it covers exactly the region, so it can
    // never leave the card.
    left: `${region.left + region.width / 2}cqw`,
    top: `${region.top + region.height / 2}cqw`,
    width: `${fit.runLength}cqw`,
    height: `${fit.runThickness}cqw`,
    transform: `translate(-50%, -50%) rotate(${text.rotation}deg)`,
    display: "flex",
    flexDirection: "column",
    justifyContent: anchor === "start" ? "flex-start" : anchor === "end" ? "flex-end" : "center",
    alignItems: text.position === "center" ? "center" : "flex-start",
    fontSize: `${fit.fontSize}cqw`,
    lineHeight: CARD_LINE_HEIGHT,
    letterSpacing: `${CARD_TRACKING}em`,
    color: cardTextColor(design, text),
  };
  return (
    <div style={style} className="numeral font-semibold uppercase" data-card-text="">
      {fit.lines.map((line, i) => (
        <span key={i} className="block whitespace-pre">
          {line || " "}
        </span>
      ))}
    </div>
  );
}

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

  return (
    <div
      role="img"
      aria-label={`${name} film card${design.texts.length ? `: ${design.texts.map((t) => t.content.replace(/\n/g, " ")).join(", ")}` : ""}`}
      className={`${s.box} relative shrink-0 overflow-hidden`}
      style={{ background: cardBackground(design), containerType: "size" }}
      data-film-card=""
    >
      {design.texts.map((text, i) => (
        <CardTextBlock key={i} design={design} text={text} />
      ))}
    </div>
  );
}

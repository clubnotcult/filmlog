/**
 * Film card: a small, structured visual identity for a film stock, stored as
 * film_stocks.card_design (jsonb). It's a configuration, not an image — the
 * card is drawn from these values wherever it appears, so nothing is
 * generated or uploaded and the Library always reflects the saved design.
 */

export const CARD_LAYOUTS = ["rows", "gradient"] as const;
export type CardLayout = (typeof CARD_LAYOUTS)[number];

export const CARD_DIRECTIONS = ["horizontal", "vertical"] as const;
export type CardDirection = (typeof CARD_DIRECTIONS)[number];

export const CARD_TEXT_POSITIONS = ["bottom", "center", "top"] as const;
export type CardTextPosition = (typeof CARD_TEXT_POSITIONS)[number];

export const CARD_TEXT_TONES = ["auto", "light", "dark"] as const;
export type CardTextTone = (typeof CARD_TEXT_TONES)[number];

export const MAX_CARD_COLORS = 3;
export const MAX_CARD_TEXT = 24;

export type FilmCardDesign = {
  version: 1;
  /** 1–3 colors, "#rrggbb". */
  colors: string[];
  layout: CardLayout;
  /** Rows: horizontal = stacked bands. Gradient: horizontal = top→bottom. */
  direction: CardDirection;
  text: string;
  textPosition: CardTextPosition;
  textTone: CardTextTone;
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return (list as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/**
 * Validates stored or submitted JSON into a design, or null when there's no
 * usable design (no colors). Unknown fields are dropped; bad enum values fall
 * back to defaults rather than failing, so an older or hand-edited value
 * still renders.
 */
export function parseFilmCardDesign(raw: unknown): FilmCardDesign | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const colors = Array.isArray(v.colors)
    ? v.colors.filter(isHexColor).map((c) => c.toLowerCase()).slice(0, MAX_CARD_COLORS)
    : [];
  if (colors.length === 0) return null;
  return {
    version: 1,
    colors,
    layout: oneOf(CARD_LAYOUTS, v.layout, "rows"),
    direction: oneOf(CARD_DIRECTIONS, v.direction, "horizontal"),
    text: typeof v.text === "string" ? v.text.trim().slice(0, MAX_CARD_TEXT) : "",
    textPosition: oneOf(CARD_TEXT_POSITIONS, v.textPosition, "bottom"),
    textTone: oneOf(CARD_TEXT_TONES, v.textTone, "auto"),
  };
}

export function defaultFilmCardDesign(name = ""): FilmCardDesign {
  return {
    version: 1,
    colors: ["#e8b923", "#1c1c1c"],
    layout: "rows",
    direction: "horizontal",
    text: name.toUpperCase().slice(0, MAX_CARD_TEXT),
    textPosition: "bottom",
    textTone: "auto",
  };
}

/**
 * CSS background for the card. Rows are hard-edged bands (two stops per
 * color at the same position), so they stay crisp at thumbnail size instead
 * of blurring into each other.
 */
export function cardBackground(design: FilmCardDesign): string {
  const { colors, layout, direction } = design;
  if (colors.length === 1) return colors[0];
  const angle = direction === "horizontal" ? "180deg" : "90deg";
  if (layout === "gradient") {
    return `linear-gradient(${angle}, ${colors.join(", ")})`;
  }
  const step = 100 / colors.length;
  const stops = colors.flatMap((c, i) => [`${c} ${(i * step).toFixed(3)}%`, `${c} ${((i + 1) * step).toFixed(3)}%`]);
  return `linear-gradient(${angle}, ${stops.join(", ")})`;
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/**
 * The color the text sits on, for automatic contrast: with rows that's the
 * band under the text (first band for top, last for bottom, middle for
 * center on horizontal rows); otherwise an average over the colors.
 */
function colorUnderText(design: FilmCardDesign): number {
  const { colors, layout, direction, textPosition } = design;
  if (layout === "rows" && direction === "horizontal") {
    const index =
      textPosition === "top" ? 0 : textPosition === "bottom" ? colors.length - 1 : Math.floor(colors.length / 2);
    return relativeLuminance(colors[index]);
  }
  return colors.reduce((sum, c) => sum + relativeLuminance(c), 0) / colors.length;
}

/** "#ffffff" or "#111111" — whichever reads better on the background under the text. */
export function cardTextColor(design: FilmCardDesign): string {
  if (design.textTone === "light") return "#ffffff";
  if (design.textTone === "dark") return "#111111";
  const l = colorUnderText(design);
  // Contrast against white vs near-black; pick the larger.
  const vsWhite = 1.05 / (l + 0.05);
  const vsDark = (l + 0.05) / 0.056;
  return vsWhite >= vsDark ? "#ffffff" : "#111111";
}

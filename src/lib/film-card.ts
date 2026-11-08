/**
 * Film card: a small, structured visual identity for a film stock, stored as
 * film_stocks.card_design (jsonb). It's a configuration, not an image — the
 * card is drawn from these values wherever it appears, so nothing is
 * generated or uploaded and the Library always reflects the saved design.
 *
 * Stored shapes (both read forever; never rewritten in the database):
 *  - version 1 (first designer): one text — {text, textPosition, textTone}
 *  - version 2: up to three independent text elements in `texts`, each with
 *    its own position, rotation and tone. Version 2 also writes the version 1
 *    fields (mirroring the first text) so an older build still shows it.
 * A version 1 design reads as a single text element at 0° — the same text,
 * position, tone and colors it was saved with.
 */

export const CARD_LAYOUTS = ["rows", "gradient"] as const;
export type CardLayout = (typeof CARD_LAYOUTS)[number];

export const CARD_DIRECTIONS = ["horizontal", "vertical"] as const;
export type CardDirection = (typeof CARD_DIRECTIONS)[number];

/** Where a text sits: a band (top/center/bottom) at 0°/180°, a strip (left/center/right) at 90°/270°. */
export const CARD_TEXT_POSITIONS = ["bottom", "center", "top"] as const;
export type CardTextPosition = (typeof CARD_TEXT_POSITIONS)[number];

export const CARD_TEXT_TONES = ["auto", "light", "dark"] as const;
export type CardTextTone = (typeof CARD_TEXT_TONES)[number];

export const CARD_ROTATIONS = [0, 90, 180, 270] as const;
export type CardRotation = (typeof CARD_ROTATIONS)[number];

export const MAX_CARD_COLORS = 3;
export const MAX_CARD_TEXTS = 3;
/** Per text element, including line breaks. */
export const MAX_CARD_TEXT = 40;

export type CardText = {
  /** May contain "\n" — intentional line breaks are always kept. */
  content: string;
  position: CardTextPosition;
  rotation: CardRotation;
  tone: CardTextTone;
};

export type FilmCardDesign = {
  version: 2;
  /** 1–3 colors, "#rrggbb". */
  colors: string[];
  layout: CardLayout;
  /** Rows: horizontal = stacked bands. Gradient: horizontal = top→bottom. */
  direction: CardDirection;
  texts: CardText[];
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function oneOf<T extends string | number>(list: readonly T[], value: unknown, fallback: T): T {
  return (list as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/** Normalises line endings, trims each line and blank lines at either end, caps the length. Never splits words. */
export function cleanCardText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n").slice(0, MAX_CARD_TEXT);
}

function parseText(raw: unknown): CardText | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const content = cleanCardText(t.content);
  if (!content) return null;
  return {
    content,
    position: oneOf(CARD_TEXT_POSITIONS, t.position, "bottom"),
    rotation: oneOf(CARD_ROTATIONS, Number(t.rotation), 0),
    tone: oneOf(CARD_TEXT_TONES, t.tone, "auto"),
  };
}

/**
 * Validates stored or submitted JSON into a design, or null when there's no
 * usable design (no colors). Accepts both stored shapes. Unknown fields are
 * dropped; bad enum values fall back to defaults rather than failing, so an
 * older or hand-edited value still renders.
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

  let texts: CardText[];
  if (Array.isArray(v.texts)) {
    texts = v.texts.map(parseText).filter((t): t is CardText => t !== null).slice(0, MAX_CARD_TEXTS);
  } else {
    // Version 1: one text, always upright.
    const legacy = parseText({ content: v.text, position: v.textPosition, rotation: 0, tone: v.textTone });
    texts = legacy ? [legacy] : [];
  }

  return {
    version: 2,
    colors,
    layout: oneOf(CARD_LAYOUTS, v.layout, "rows"),
    direction: oneOf(CARD_DIRECTIONS, v.direction, "horizontal"),
    texts,
  };
}

/** What the designer saves: version 2, plus the version 1 fields mirroring the first text for older builds. */
export function serializeFilmCardDesign(design: FilmCardDesign): Record<string, unknown> {
  const first = design.texts[0];
  return {
    version: 2,
    colors: design.colors,
    layout: design.layout,
    direction: design.direction,
    texts: design.texts,
    text: first ? first.content.replace(/\n/g, " ") : "",
    textPosition: first?.position ?? "bottom",
    textTone: first?.tone ?? "auto",
  };
}

export function defaultCardText(content = ""): CardText {
  return { content: cleanCardText(content), position: "bottom", rotation: 0, tone: "auto" };
}

export function defaultFilmCardDesign(name = ""): FilmCardDesign {
  return {
    version: 2,
    colors: ["#e8b923", "#1c1c1c"],
    layout: "rows",
    direction: "horizontal",
    texts: name.trim() ? [defaultCardText(name.toUpperCase())] : [],
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

export function isRotatedSideways(rotation: CardRotation): boolean {
  return rotation === 90 || rotation === 270;
}

/**
 * The background colors a text sits on. An upright text lies in a
 * horizontal band, so with horizontal rows it sits on exactly one color; a
 * sideways text lies in a vertical strip, so it lines up with vertical rows.
 * Otherwise (gradients, or a text crossing the bands) it can touch every
 * color, so all of them count.
 */
function colorsUnderText(design: FilmCardDesign, text: CardText): string[] {
  const { colors, layout, direction } = design;
  const alongBands =
    layout === "rows" &&
    ((direction === "horizontal" && !isRotatedSideways(text.rotation)) ||
      (direction === "vertical" && isRotatedSideways(text.rotation)));
  if (!alongBands) return colors;
  const index =
    text.position === "top" ? 0 : text.position === "bottom" ? colors.length - 1 : Math.floor(colors.length / 2);
  return [colors[index]];
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * "#ffffff" or "#111111". Automatic tone picks whichever has the better
 * worst-case contrast across every color under the text, so a label that
 * crosses a light and a dark band never vanishes into one of them.
 */
export function cardTextColor(design: FilmCardDesign, text: CardText): string {
  if (text.tone === "light") return "#ffffff";
  if (text.tone === "dark") return "#111111";
  const lums = colorsUnderText(design, text).map(relativeLuminance);
  const worstLight = Math.min(...lums.map((l) => contrast(1, l)));
  const worstDark = Math.min(...lums.map((l) => contrast(relativeLuminance("#111111"), l)));
  return worstLight >= worstDark ? "#ffffff" : "#111111";
}

// ---------------------------------------------------------------------------
// Text fitting
//
// All geometry is in units of 1% of the card's width ("cqw" when rendered,
// with the card as a size container), so one calculation is exact at every
// card size — the designer's large preview, the Library thumbnail and the
// small card in the viewer all lay out identically.
//
// The card font is monospaced (Geist Mono: every glyph advances 0.6em), so a
// line's width is known exactly from its character count; nothing has to be
// measured in a browser, and server-rendered cards match the live preview.
// ---------------------------------------------------------------------------

export const CARD_WIDTH = 100;
export const CARD_HEIGHT = (100 * 4) / 3;
const PAD = 7;
/** Share of the card's inner height (upright) or inner width (sideways) one text region takes. */
const REGION_SHARE = 0.42;
export const CARD_GLYPH_ADVANCE = 0.6;
export const CARD_TRACKING = 0.06;
export const CARD_LINE_HEIGHT = 1.12;
/** Headroom so sub-pixel rounding can never push a glyph past the edge. */
const SAFETY = 0.96;
/** A restrained ceiling: short text like "400" stays a label, not a poster. */
const MAX_FONT = 22;

export type CardRegion = { left: number; top: number; width: number; height: number };

/** The rectangle (card units) a text element owns, before rotation is applied to its content. */
export function cardTextRegion(text: Pick<CardText, "position" | "rotation">): CardRegion {
  const innerW = CARD_WIDTH - 2 * PAD;
  const innerH = CARD_HEIGHT - 2 * PAD;
  const along = (start: number, size: number, length: number) =>
    text.position === "top" ? start : text.position === "bottom" ? start + size - length : start + (size - length) / 2;
  if (isRotatedSideways(text.rotation)) {
    const width = innerW * REGION_SHARE;
    return { left: along(PAD, innerW, width), top: PAD, width, height: innerH };
  }
  const height = innerH * REGION_SHARE;
  return { left: PAD, top: along(PAD, innerH, height), width: innerW, height };
}

/** Greedy word wrap within each explicit line; null if some single word is longer than maxChars. */
function wrap(paragraphs: string[], maxChars: number): string[] | null {
  const out: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(" ")) {
      if (word.length > maxChars) return null; // never break inside a word
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export type FittedText = {
  lines: string[];
  /** Font size in card units (cqw). */
  fontSize: number;
  region: CardRegion;
  /** Length of a line's run (along the reading direction) and the stacked lines' thickness, in card units. */
  runLength: number;
  runThickness: number;
};

/**
 * The largest font size at which the text fits its region, wrapping only
 * between words and keeping every intentional line break. If a single word
 * is too long for a sensible size, the size keeps shrinking until it fits —
 * text is never cut, truncated or dropped.
 */
export function fitCardText(text: CardText): FittedText {
  const region = cardTextRegion(text);
  const sideways = isRotatedSideways(text.rotation);
  const runLength = (sideways ? region.height : region.width) * SAFETY;
  const runThickness = (sideways ? region.width : region.height) * SAFETY;
  const paragraphs = text.content.toUpperCase().split("\n");
  const charWidth = CARD_GLYPH_ADVANCE + CARD_TRACKING;

  const layoutAt = (size: number): string[] | null => {
    const maxChars = Math.floor(runLength / (size * charWidth) + 1e-9);
    if (maxChars < 1) return null;
    const lines = wrap(paragraphs, maxChars);
    if (!lines) return null;
    return lines.length * size * CARD_LINE_HEIGHT <= runThickness + 1e-9 ? lines : null;
  };

  // Feasibility is monotonic in size (smaller always fits at least as well),
  // so a binary search finds the largest size that fits.
  let lo = 0;
  let hi = MAX_FONT;
  let best: string[] | null = layoutAt(hi);
  if (best) return { lines: best, fontSize: hi, region, runLength, runThickness };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const lines = layoutAt(mid);
    if (lines) {
      lo = mid;
      best = lines;
    } else {
      hi = mid;
    }
  }
  return {
    lines: best ?? paragraphs,
    fontSize: Math.floor(lo * 1000) / 1000,
    region,
    runLength,
    runThickness,
  };
}

/**
 * How the fitted block sits inside its region so it hugs the edge named by
 * `position` once rotated: "start" / "center" / "end" along the block's own
 * (pre-rotation) vertical axis.
 */
export function cardTextAnchor(text: Pick<CardText, "position" | "rotation">): "start" | "center" | "end" {
  if (text.position === "center") return "center";
  const towardTop = text.position === "top"; // top band, or left strip when sideways
  switch (text.rotation) {
    case 0:
      return towardTop ? "start" : "end";
    case 180:
      return towardTop ? "end" : "start";
    case 90: // clockwise: the block's top edge faces right
      return towardTop ? "end" : "start";
    case 270: // counter-clockwise: the block's top edge faces left
      return towardTop ? "start" : "end";
  }
}

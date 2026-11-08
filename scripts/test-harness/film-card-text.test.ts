// Run: npx tsx --test scripts/test-harness/film-card-text.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatLongDateRange, formatShortDateRange } from "../../src/lib/date";
import { generateRollTitle } from "../../src/lib/roll-title";
import {
  CARD_GLYPH_ADVANCE,
  CARD_HEIGHT,
  CARD_LINE_HEIGHT,
  CARD_ROTATIONS,
  CARD_TRACKING,
  CARD_WIDTH,
  cardBackground,
  cardTextAnchor,
  cardTextColor,
  fitCardText,
  parseFilmCardDesign,
  serializeFilmCardDesign,
  type CardText,
} from "../../src/lib/film-card";

// ---- roll dates --------------------------------------------------------------
test("same-day rolls show the date once; multi-day rolls show the range", () => {
  assert.equal(formatShortDateRange("2026-11-06", "2026-11-06"), "11.6");
  assert.equal(formatShortDateRange("2026-11-06", "2026-11-08"), "11.6–11.8");
  assert.equal(formatShortDateRange("2026-11-06", null), "11.6");
  assert.equal(formatLongDateRange("2026-11-06", "2026-11-06"), "Nov 6, 2026");
  assert.equal(formatLongDateRange("2026-12-30", "2027-01-02"), "Dec 30, 2026 – Jan 2, 2027");
  assert.equal(
    generateRollTitle({ startDate: "2026-11-06", endDate: "2026-11-06", filmStockName: "Portra 400", customTitle: "ATX" }),
    "11.6 · Portra 400 · ATX",
  );
  assert.equal(
    generateRollTitle({ startDate: "2026-11-06", endDate: "2026-11-08", filmStockName: "Portra 400", customTitle: null }),
    "11.6–11.8 · Portra 400",
  );
  // Same day in different years is a range, not one date.
  assert.equal(formatShortDateRange("2025-11-06", "2026-11-06"), "11.6–11.6");
});

// ---- the designs that exist in production today (version 1 shape) ---------
const EXISTING: Record<string, unknown>[] = [
  { text: "CINESTILL 400D", colors: ["#6749b9"], layout: "rows", version: 1, textTone: "light", direction: "horizontal", textPosition: "bottom" },
  { text: "ILFORD PAN F PLUS", colors: ["#ffffff", "#ffffff", "#ebad21"], layout: "rows", version: 1, textTone: "auto", direction: "vertical", textPosition: "bottom" },
  { text: "JCH STREET PAN", colors: ["#000000", "#e60224"], layout: "rows", version: 1, textTone: "auto", direction: "vertical", textPosition: "bottom" },
  { text: "KODAK EKTACOLOR PRO 400", colors: ["#ffb71c", "#635bc8"], layout: "rows", version: 1, textTone: "auto", direction: "horizontal", textPosition: "bottom" },
  { text: "KODAK PORTRA 400", colors: ["#7879ba", "#7a288a", "#fec30f"], layout: "gradient", version: 1, textTone: "light", direction: "vertical", textPosition: "bottom" },
  { text: "LOMOGRAPHY COLOR NEGATIV", colors: ["#5d7f21", "#4297b4"], layout: "gradient", version: 1, textTone: "light", direction: "horizontal", textPosition: "bottom" },
  { text: "MANUAL MC800", colors: ["#a4c4ed"], layout: "rows", version: 1, textTone: "dark", direction: "horizontal", textPosition: "bottom" },
  { text: "OPTIK OLDSCHOOL OPTICOLO", colors: ["#10bce4", "#f27346"], layout: "rows", version: 1, textTone: "light", direction: "horizontal", textPosition: "bottom" },
];

test("every existing design reads back with its colors, layout, text, position and tone unchanged", () => {
  for (const raw of EXISTING) {
    const d = parseFilmCardDesign(raw)!;
    assert.ok(d, `${raw.text} parses`);
    assert.deepEqual(d.colors, raw.colors);
    assert.equal(d.layout, raw.layout);
    assert.equal(d.direction, raw.direction);
    assert.equal(d.texts.length, 1);
    assert.deepEqual(d.texts[0], { content: raw.text, position: raw.textPosition, rotation: 0, tone: raw.textTone });
    // The background is computed only from colors/layout/direction, so it is identical to before.
    assert.equal(cardBackground(d), cardBackground(parseFilmCardDesign({ ...raw })!));
  }
});

test("opening and re-saving an existing design keeps it — and older builds still read it", () => {
  for (const raw of EXISTING) {
    const saved = serializeFilmCardDesign(parseFilmCardDesign(raw)!);
    const reread = parseFilmCardDesign(JSON.parse(JSON.stringify(saved)))!;
    assert.deepEqual(reread, parseFilmCardDesign(raw), `${raw.text} round-trips`);
    // The version 1 fields an older build reads are still there and equal.
    assert.equal(saved.text, raw.text);
    assert.equal(saved.textPosition, raw.textPosition);
    assert.equal(saved.textTone, raw.textTone);
    assert.deepEqual(saved.colors, raw.colors);
  }
});

test("a version 2 design is not mistaken for version 1, and keeps up to three texts", () => {
  const d = parseFilmCardDesign({
    version: 2,
    colors: ["#e8b923"],
    texts: [
      { content: "KODAK", position: "top", rotation: 0, tone: "dark" },
      { content: "400", position: "bottom", rotation: 270, tone: "auto" },
      { content: "  ", position: "center" },
      { content: "x", rotation: 45 },
      { content: "y" },
    ],
    text: "ignored legacy mirror",
  })!;
  assert.deepEqual(d.texts.map((t) => `${t.content}@${t.rotation}`), ["KODAK@0", "400@270", "x@0"]);
});

// ---- fitting -------------------------------------------------------------------
const charWidth = CARD_GLYPH_ADVANCE + CARD_TRACKING;
const t = (content: string, rotation: CardText["rotation"] = 0, position: CardText["position"] = "bottom"): CardText => ({
  content,
  position,
  rotation,
  tone: "auto",
});

/** Asserts the fitted block fits its region and its region fits the card. */
function assertFits(text: CardText) {
  const fit = fitCardText(text);
  const longest = Math.max(...fit.lines.map((l) => l.length));
  assert.ok(longest * fit.fontSize * charWidth <= fit.runLength + 1e-6, `"${text.content}" width fits`);
  assert.ok(fit.lines.length * fit.fontSize * CARD_LINE_HEIGHT <= fit.runThickness + 1e-6, `"${text.content}" height fits`);
  const r = fit.region;
  assert.ok(r.left >= 0 && r.top >= 0 && r.left + r.width <= CARD_WIDTH && r.top + r.height <= CARD_HEIGHT, "region inside card");
  // Nothing dropped or split mid-word.
  const words = (s: string) => s.toUpperCase().split(/\s+/).filter(Boolean);
  assert.deepEqual(words(fit.lines.join(" ")), words(text.content), `"${text.content}" keeps every word whole`);
  return fit;
}

test("short text is capped, long text wraps between words to a larger size than one line", () => {
  const short = assertFits(t("400"));
  assert.equal(short.lines.length, 1);
  const long = assertFits(t("KODAK EKTACOLOR PRO 400"));
  assert.ok(long.lines.length > 1, "long text wraps");
  const oneLineSize = (CARD_WIDTH - 14) * 0.96 / (23 * charWidth);
  assert.ok(long.fontSize > oneLineSize, "wrapping beats shrinking to one tiny line");
  assert.ok(short.fontSize > long.fontSize);
});

test("intentional line breaks are always kept", () => {
  const fit = assertFits(t("PORTRA\n400"));
  assert.deepEqual(fit.lines, ["PORTRA", "400"]);
  const three = assertFits(t("KODAK\nPORTRA\n400"));
  assert.deepEqual(three.lines, ["KODAK", "PORTRA", "400"]);
  // A long explicit line may still wrap between its own words, never across the break.
  const mixed = assertFits(t("ILFORD\nPAN F PLUS 125 ISO FILM"));
  assert.equal(mixed.lines[0], "ILFORD");
});

test("one very long word shrinks rather than being cut or broken", () => {
  const fit = assertFits(t("SUPERCALIFRAGILISTICEXPIALID"));
  assert.deepEqual(fit.lines, ["SUPERCALIFRAGILISTICEXPIALID"]);
  assert.ok(fit.fontSize > 0);
});

test("all existing designs fit, and every rotation and position fits for every sample", () => {
  const samples = [...EXISTING.map((r) => String(r.text)), "400", "TRI-X", "KODAK\nPORTRA\n400", "A B C D E F G H I J K L M N O"];
  for (const content of samples) {
    for (const rotation of CARD_ROTATIONS) {
      for (const position of ["top", "center", "bottom"] as const) assertFits(t(content, rotation, position));
    }
  }
});

test("sideways text uses the card's height, so it can be larger than upright for long labels", () => {
  const upright = fitCardText(t("KODAK PORTRA 400", 0));
  const sideways = fitCardText(t("KODAK PORTRA 400", 90));
  assert.ok(sideways.region.height > sideways.region.width);
  assert.equal(sideways.runLength > upright.runLength, true);
});

test("automatic text color stays legible across every band a sideways label crosses", () => {
  const design = parseFilmCardDesign({ colors: ["#f2c94c", "#1a1a1a"], layout: "rows", direction: "horizontal", texts: [] })!;
  // Sideways across yellow + near-black: dark would vanish on the black half.
  assert.equal(cardTextColor(design, { content: "400", position: "bottom", rotation: 270, tone: "auto" }), "#ffffff");
  // Upright in the yellow band only: dark reads best.
  assert.equal(cardTextColor(design, { content: "KODAK", position: "top", rotation: 0, tone: "auto" }), "#111111");
  // Explicit tones are always respected.
  assert.equal(cardTextColor(design, { content: "X", position: "top", rotation: 0, tone: "light" }), "#ffffff");
});

test("existing designs keep the automatic text color they had before", () => {
  // Every production design is upright, bottom-positioned: the band under it is unchanged, so the pick is too.
  const expected: Record<string, string> = {
    "KODAK EKTACOLOR PRO 400": "#ffffff", // on #635bc8
    "JCH STREET PAN": "#ffffff", // vertical rows: average of black + red, as before
    "ILFORD PAN F PLUS": "#111111", // vertical rows: white, white, gold
  };
  for (const raw of EXISTING) {
    const want = expected[String(raw.text)];
    if (!want) continue;
    const d = parseFilmCardDesign(raw)!;
    assert.equal(cardTextColor(d, d.texts[0]), want, String(raw.text));
  }
});

test("rotated text hugs the edge its position names", () => {
  assert.equal(cardTextAnchor({ position: "bottom", rotation: 0 }), "end");
  assert.equal(cardTextAnchor({ position: "bottom", rotation: 180 }), "start");
  assert.equal(cardTextAnchor({ position: "top", rotation: 90 }), "end");
  assert.equal(cardTextAnchor({ position: "top", rotation: 270 }), "start");
  assert.equal(cardTextAnchor({ position: "center", rotation: 90 }), "center");
});

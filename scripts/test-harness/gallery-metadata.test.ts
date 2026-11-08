// Run: npx tsx --test scripts/test-harness/gallery-metadata.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilmCard, FilmStockDot } from "../../src/components/film-card";
import { ExploreResultCard } from "../../src/components/explore/result-card";
import { cardBackground, parseFilmCardDesign } from "../../src/lib/film-card";
import type { Frame } from "../../src/lib/database.types";

// Real production designs (version 1 shape) plus a rotated, multi-text version 2 one.
const portra = parseFilmCardDesign({ text: "KODAK PORTRA 400", colors: ["#7879ba", "#7a288a", "#fec30f"], layout: "gradient", version: 1, textTone: "light", direction: "vertical", textPosition: "bottom" })!;
const ektacolor = parseFilmCardDesign({ text: "KODAK EKTACOLOR PRO 400", colors: ["#ffb71c", "#635bc8"], layout: "rows", version: 1, textTone: "auto", direction: "horizontal", textPosition: "bottom" })!;
const trix = parseFilmCardDesign({ version: 2, colors: ["#f2c94c", "#1a1a1a"], layout: "rows", direction: "horizontal", texts: [{ content: "KODAK", position: "top", rotation: 0 }, { content: "400", position: "bottom", rotation: 270 }] })!;

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const textOf = (markup: string) => markup.replace(/<[^>]*>/g, "");
/** React serialises inline styles with &quot; for quotes inside values. */
const decoded = (markup: string) => markup.replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

test("film stock dot: a circle painted with the design's own background, and no text at all", () => {
  for (const design of [portra, ektacolor, trix]) {
    const markup = html(createElement(FilmStockDot, { design, name: "Some film", size: 11 }));
    assert.equal(textOf(markup), "", "no text content");
    assert.match(markup, /rounded-full/);
    assert.ok(decoded(markup).includes(`background:${cardBackground(design)}`), "same background as the card");
    assert.match(markup, /width:11px;height:11px/);
    // None of the card's words leak in, even as attributes other than the accessible name.
    for (const t of design.texts) assert.ok(!markup.includes(t.content), `no "${t.content}"`);
  }
});

test("film stock dot: neutral outlined fallback without a design — no invented colors", () => {
  const markup = html(createElement(FilmStockDot, { design: null, name: "Tri-X 400" }));
  assert.match(markup, /rounded-full/);
  assert.match(markup, /border border-border bg-surface/);
  assert.ok(!/background:/.test(markup));
  assert.equal(textOf(markup), "");
});

test("the dot never alters the saved design", () => {
  const before = JSON.stringify(trix);
  html(createElement(FilmStockDot, { design: trix }));
  html(createElement(FilmCard, { design: trix, iso: 400, name: "Tri-X", size: "sm" }));
  assert.equal(JSON.stringify(trix), before);
});

const frame = (over: Partial<Frame> = {}): Frame =>
  ({
    id: "f-1",
    roll_id: "r-1",
    frame_number: 17,
    drive_filename: "84726199.jpg",
    drive_thumbnail_url: null,
    selection: "star",
    metadata_logged: false,
    ...over,
  }) as Frame;

const card = (props: Partial<Parameters<typeof ExploreResultCard>[0]> = {}) =>
  html(
    createElement(ExploreResultCard, {
      frame: frame(),
      href: "/rolls/r-1/frames/f-1?ctx=explore",
      roll: { id: "r-1", title: "11.6 · Portra 400 · ATX" },
      filmStock: { name: "Kodak Portra 400", design: portra },
      cameraAbbreviation: "F-1",
      ...props,
    }),
  );

test("gallery card: filename, then roll name (linked), then dot · shot number · abbreviation — in that order", () => {
  const markup = card();
  const iFile = markup.indexOf("84726199.jpg");
  const iRoll = markup.indexOf("11.6 · Portra 400 · ATX");
  const iDot = markup.indexOf("data-film-dot");
  const iShot = markup.indexOf("#17");
  const iAbbr = markup.indexOf(">F-1<");
  assert.ok(iFile > -1 && iFile < iRoll && iRoll < iDot && iDot < iShot && iShot < iAbbr, "exact three-line order");
  assert.match(markup, /<a [^>]*href="\/rolls\/r-1"[^>]*>11\.6 · Portra 400 · ATX<\/a>/, "roll name links to the roll");
  assert.match(markup, /<a [^>]*href="\/rolls\/r-1\/frames\/f-1\?ctx=explore"/, "image keeps its explore navigation link");
  assert.ok(!/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /.test(markup), "no link nested inside another link");
  // Exposure, lens, film stock name and full camera name are no longer on the card.
  assert.ok(!textOf(markup).includes("Kodak Portra 400"), "stock name only as the dot's label, not as text");
});

test("gallery card: shot number is the frame's own frame_number", () => {
  for (const n of [1, 9, 36, 38]) assert.match(card({ frame: frame({ frame_number: n }) }), new RegExp(`>#${n}<`));
});

test("gallery card: an abbreviation edit shows up as-is; no abbreviation shows nothing (no full name, no placeholder)", () => {
  assert.match(card({ cameraAbbreviation: "AF-1" }), />AF-1</);
  const lineThree = (markup: string) => textOf(markup.slice(markup.lastIndexOf("<p", markup.indexOf("data-film-dot"))));
  assert.equal(lineThree(card({ cameraAbbreviation: "F-1" })), "#17·F-1");
  const none = lineThree(card({ cameraAbbreviation: null }));
  assert.equal(none, "#17", "no abbreviation: just the shot number — no name, placeholder or dangling separator");
});

test("gallery card: missing roll / film stock / filename degrade gracefully", () => {
  const markup = card({ roll: null, filmStock: null, cameraAbbreviation: null, frame: frame({ drive_filename: null, frame_number: 4 }) });
  const text = textOf(markup);
  assert.ok(text.includes("Frame 4"), "falls back to the frame label it always used");
  assert.ok(!markup.includes('href="/rolls/r-1"'), "no roll link without a roll");
  assert.ok(!markup.includes("data-film-dot"), "no dot without a film stock");
  assert.ok(text.includes("#4"));
  assert.ok(!/undefined|null|NaN/.test(text));
});

test("gallery card: a stock without a design gets the neutral dot", () => {
  const markup = card({ filmStock: { name: "Tri-X 400", design: null } });
  assert.match(markup, /data-film-dot="" class="inline-block shrink-0 rounded-full border border-border bg-surface"/);
});

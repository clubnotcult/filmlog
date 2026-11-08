"use client";

import { useState } from "react";
import { FilmCard } from "@/components/film-card";
import {
  MAX_CARD_COLORS,
  MAX_CARD_TEXT,
  defaultFilmCardDesign,
  type CardDirection,
  type CardLayout,
  type CardTextPosition,
  type CardTextTone,
  type FilmCardDesign,
} from "@/lib/film-card";

const ADD_COLOR_SEQUENCE = ["#d9481c", "#f4efe6", "#2f5d8a", "#e8b923", "#1c1c1c"];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex border border-border">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`numeral h-9 flex-1 px-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
              on ? "bg-foreground text-background" : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The film card designer: up to three colors, rows or gradient, one line of
 * text. Deliberately small — a label for the box, not a design tool. The
 * preview uses the same FilmCard component as the Library, at both editing
 * size and the real thumbnail size, so legibility at small scale is visible
 * while choosing. Saves as structured JSON in a hidden field.
 */
export function FilmCardDesigner({
  initial,
  stockName,
  iso,
}: {
  initial: FilmCardDesign | null;
  stockName: string;
  iso: number | null;
}) {
  const [enabled, setEnabled] = useState(initial !== null);
  const [design, setDesign] = useState<FilmCardDesign>(initial ?? defaultFilmCardDesign(stockName));

  const update = (patch: Partial<FilmCardDesign>) => setDesign((d) => ({ ...d, ...patch }));
  const setColor = (i: number, color: string) =>
    update({ colors: design.colors.map((c, j) => (j === i ? color.toLowerCase() : c)) });
  const removeColor = (i: number) => update({ colors: design.colors.filter((_, j) => j !== i) });
  // A new band starts as a distinct, film-box-like color (not a copy of the
  // last one, which would look like nothing happened); then pick your own.
  const addColor = () => {
    const next = ADD_COLOR_SEQUENCE.find((c) => !design.colors.includes(c)) ?? "#f4efe6";
    update({ colors: [...design.colors, next].slice(0, MAX_CARD_COLORS) });
  };

  const shown = enabled && design.colors.length > 0 ? design : null;

  return (
    <fieldset className="space-y-4 border-y border-border py-5">
      <input type="hidden" name="card_design" value={shown ? JSON.stringify(shown) : ""} />

      <div className="flex items-center justify-between gap-3">
        <legend className="label">Film card</legend>
        <label className="flex items-center gap-2 text-xs text-muted-strong">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
          Custom design
        </label>
      </div>

      <div className="flex items-end gap-5">
        <FilmCard design={shown} iso={iso} name={stockName} size="lg" />
        <div className="flex flex-col items-start gap-1.5">
          <FilmCard design={shown} iso={iso} name={stockName} size="md" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Library size</span>
        </div>
      </div>

      {enabled ? (
        <div className="space-y-4">
          <div>
            <span className="label block">Colors</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {design.colors.map((color, i) => (
                <div key={i} className="flex items-center border border-border">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(i, e.target.value)}
                    aria-label={`Color ${i + 1}`}
                    className="h-9 w-11 cursor-pointer border-0 bg-transparent p-1"
                  />
                  <span className="numeral w-[4.5rem] text-[11px] uppercase text-muted-strong">{color}</span>
                  {design.colors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeColor(i)}
                      aria-label={`Remove color ${i + 1}`}
                      className="flex h-9 w-8 items-center justify-center text-muted hover:text-danger"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {design.colors.length < MAX_CARD_COLORS && (
                <button type="button" onClick={addColor} className="label h-9 px-2 !text-accent">
                  + Color
                </button>
              )}
            </div>
          </div>

          {design.colors.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label mb-1.5 block">Arrangement</span>
                <Segmented<CardLayout>
                  label="Arrangement"
                  value={design.layout}
                  onChange={(layout) => update({ layout })}
                  options={[
                    { value: "rows", label: "Rows" },
                    { value: "gradient", label: "Gradient" },
                  ]}
                />
              </div>
              <div>
                <span className="label mb-1.5 block">Direction</span>
                <Segmented<CardDirection>
                  label="Direction"
                  value={design.direction}
                  onChange={(direction) => update({ direction })}
                  options={[
                    { value: "horizontal", label: "Stacked" },
                    { value: "vertical", label: "Side" },
                  ]}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="card_text" className="label mb-1.5 block">
              Text
            </label>
            <input
              id="card_text"
              value={design.text}
              maxLength={MAX_CARD_TEXT}
              onChange={(e) => update({ text: e.target.value })}
              placeholder="PORTRA 400"
              className="field"
            />
          </div>

          {design.text.trim() && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label mb-1.5 block">Text position</span>
                <Segmented<CardTextPosition>
                  label="Text position"
                  value={design.textPosition}
                  onChange={(textPosition) => update({ textPosition })}
                  options={[
                    { value: "top", label: "Top" },
                    { value: "center", label: "Mid" },
                    { value: "bottom", label: "Base" },
                  ]}
                />
              </div>
              <div>
                <span className="label mb-1.5 block">Text color</span>
                <Segmented<CardTextTone>
                  label="Text color"
                  value={design.textTone}
                  onChange={(textTone) => update({ textTone })}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">
          Without a design, rolls of this film show a plain tile with its ISO.
        </p>
      )}
    </fieldset>
  );
}

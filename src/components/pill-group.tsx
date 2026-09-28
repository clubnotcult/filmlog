"use client";

import { useEffect, useRef } from "react";

/**
 * A dial scale: values on a measured track, the selected one locked at a
 * registration notch in the center.
 *
 * Interaction (unchanged in logic from the earlier carousel): native CSS
 * scroll-snap with spacer padding so even the first/last value can reach the
 * center; a swipe settles on one value, detected by measuring which value's
 * center is nearest the track's center once scrolling stops (debounced —
 * `scrollend` isn't universal). A tap scrolls that value to center and the
 * same settle-and-measure confirms it.
 *
 * Design (this is where the physical logic lives):
 *  - Values are type, not buttons — no pills, no fills, no borders. The
 *    hairline rails above and below and the notch between them do the
 *    "instrument" work; decoration would only compete with the numerals.
 *  - Every value has the same fixed cell width and the font is monospaced,
 *    so selecting a value changes only colour and a transform (which doesn't
 *    affect layout). Nothing reflows, ever — the scale can't jitter.
 *  - The track height is fixed and shared with the empty state, so a lens or
 *    camera with no configured stops doesn't change the screen's height.
 *  - Colour has one job: the selected value is foreground ink if it was
 *    inherited from the previous frame, and the signal colour once you've
 *    actively changed it — "did I actually set this?" answered at a glance.
 *
 * `reviewMode` is for an existing saved frame: there's no inherited/changed
 * distinction for a recorded fact, so the selected value is simply ink.
 */
export function PillGroup<T extends string | number>({
  label,
  options,
  optionLabel,
  value,
  touched,
  onSelect,
  emptyMessage,
  reviewMode = false,
}: {
  label: string;
  options: T[];
  optionLabel: (option: T) => string;
  value: T | null;
  touched: boolean;
  onSelect: (option: T) => void;
  emptyMessage?: string;
  reviewMode?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const hasMounted = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = value !== null ? itemRefs.current.get(value) : undefined;
    el?.scrollIntoView({
      behavior: hasMounted.current ? "smooth" : "auto",
      inline: "center",
      block: "nearest",
    });
    hasMounted.current = true;
  }, [value]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function handleScroll() {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        const trackEl = trackRef.current;
        if (!trackEl) return;
        const trackCenter = trackEl.getBoundingClientRect().left + trackEl.clientWidth / 2;

        let closest: T | null = null;
        let closestDistance = Infinity;
        for (const [option, el] of itemRefs.current) {
          const rect = el.getBoundingClientRect();
          const distance = Math.abs(rect.left + rect.width / 2 - trackCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = option;
          }
        }
        if (closest !== null && closest !== value) {
          onSelect(closest);
        }
      }, 120);
    }

    track.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", handleScroll);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  const changed = !reviewMode && touched;

  return (
    <div>
      <div className="flex h-3 items-center justify-between">
        <span className="label">{label}</span>
        {!reviewMode && value !== null && (
          <span className={`label ${changed ? "!text-accent" : ""}`}>
            {changed ? "set" : "held"}
          </span>
        )}
      </div>

      {options.length === 0 ? (
        <div className="mt-2 flex h-14 items-center border-y border-border">
          <p className="text-xs text-muted">{emptyMessage ?? "No options configured."}</p>
        </div>
      ) : (
        <div className="relative mt-2 border-y border-border">
          {/* Registration notch: two short ticks reaching in from the rails,
              framing the locked value. Ticks, not arrows — it marks a
              position, it doesn't point at anything. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 z-10 h-2 w-px -translate-x-1/2 bg-accent"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-1/2 z-10 h-2 w-px -translate-x-1/2 bg-accent"
          />
          <div
            ref={trackRef}
            className="no-scrollbar flex h-14 snap-x snap-mandatory items-center overflow-x-auto"
          >
            <div className="w-[42%] shrink-0" aria-hidden="true" />
            {options.map((option) => {
              const selected = value !== null && option === value;
              return (
                <button
                  key={optionLabel(option)}
                  ref={(el) => {
                    if (el) itemRefs.current.set(option, el);
                    else itemRefs.current.delete(option);
                  }}
                  type="button"
                  onClick={() => onSelect(option)}
                  aria-pressed={selected}
                  className={`numeral flex h-14 min-w-[4.25rem] shrink-0 snap-center items-center justify-center px-2 text-xl transition-[color,transform] duration-150 ${
                    selected
                      ? `scale-110 ${changed ? "text-accent" : "text-foreground"}`
                      : "text-muted/70 hover:text-muted-strong"
                  }`}
                >
                  {optionLabel(option)}
                </button>
              );
            })}
            <div className="w-[42%] shrink-0" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * A camera-dial-style selector: the selected value stays visually centered,
 * adjacent values are visible on either side, and swiping snaps to the
 * nearest value — used for shutter speed, aperture, and push/pull.
 *
 * How centering works: two invisible spacer elements, each ~40% of the
 * track's own width, sit before the first and after the last pill. That
 * gives every pill — including the first and last — room to actually reach
 * the horizontal center of the visible track, which a plain "scroll to the
 * end" list can't do for its edge items. `snap-x snap-mandatory` plus
 * `snap-center` on each pill (native CSS scroll-snap, no extra dependency)
 * makes a swipe settle exactly on one value rather than an arbitrary
 * position.
 *
 * How swipe-driven selection works: scrolling doesn't call onSelect on every
 * frame — it waits for scrolling to settle (a short debounce after the last
 * scroll event, since `scrollend` isn't supported everywhere), then measures
 * which pill's center is now closest to the track's center and treats that
 * as the new selection. A selection made by tapping a pill still works the
 * same way underneath: the tap scrolls that pill to center, which the same
 * settle-and-measure logic then confirms as the selection.
 *
 * `touched` controls the inherited-vs-changed styling from Phase 3 (muted =
 * inherited, full emphasis = actively changed) for the shooting composer.
 * `reviewMode` is for viewing an existing saved frame instead: there's no
 * "inherited" concept for a historical fact, so the selected pill always
 * renders at full emphasis and no inherited/changed label is shown.
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

  // Center the selected pill whenever the value changes (tap, frame
  // navigation, or a settled swipe echoing the value back). Instant on the
  // very first render so opening the screen doesn't visibly animate; smooth
  // afterward so a tap or programmatic change feels deliberate.
  useEffect(() => {
    const el = value !== null ? itemRefs.current.get(value) : undefined;
    el?.scrollIntoView({
      behavior: hasMounted.current ? "smooth" : "auto",
      inline: "center",
      block: "nearest",
    });
    hasMounted.current = true;
  }, [value]);

  // Detect a swipe settling on a different pill than the current value.
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

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        {!reviewMode && value !== null && (
          <span
            className={`font-mono text-xs ${touched ? "text-accent" : "text-muted"}`}
          >
            {touched ? "changed" : "inherited"}
          </span>
        )}
      </div>

      {options.length === 0 ? (
        // Same min-height as the pill track below, so switching to a lens
        // or camera with no configured options doesn't change this field's
        // height and shift everything after it.
        <div className="flex min-h-[calc(2.5rem+0.5rem)] items-center">
          <p className="text-xs text-muted">{emptyMessage ?? "No options configured."}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Center indicator: a thin, quiet line marking the exact selected
              position — not a decorative arrow, just an alignment mark
              (Leica-style restraint, not an arcade-machine pointer). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-muted-strong/40"
          />
          <div
            ref={trackRef}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="w-[40%] shrink-0" aria-hidden="true" />
            {options.map((option) => {
              const selected = value !== null && option === value;
              const fullEmphasis = reviewMode ? selected : selected && touched;
              const mutedSelected = selected && !fullEmphasis;
              return (
                <button
                  key={optionLabel(option)}
                  ref={(el) => {
                    if (el) itemRefs.current.set(option, el);
                    else itemRefs.current.delete(option);
                  }}
                  type="button"
                  onClick={() => onSelect(option)}
                  className={`
                    shrink-0 snap-center rounded-full border px-4 py-2.5 font-mono text-base transition-colors
                    ${
                      fullEmphasis
                        ? "border-accent bg-accent text-black"
                        : mutedSelected
                          ? "border-muted-strong bg-surface-raised text-muted-strong"
                          : "border-border bg-surface text-muted hover:text-foreground"
                    }
                  `}
                >
                  {optionLabel(option)}
                </button>
              );
            })}
            <div className="w-[40%] shrink-0" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

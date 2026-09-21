"use client";

/**
 * A horizontally scrollable row of tactile selectable pills — used for
 * shutter speed, aperture, and push/pull. `touched` controls the
 * inherited-vs-changed visual distinction (spec: inherited = muted, changed =
 * full emphasis); it reflects whether the *field itself* has been actively
 * interacted with this frame, independent of which value is selected.
 */
export function PillGroup<T extends string | number>({
  label,
  options,
  optionLabel,
  value,
  touched,
  onSelect,
  emptyMessage,
}: {
  label: string;
  options: T[];
  optionLabel: (option: T) => string;
  value: T | null;
  touched: boolean;
  onSelect: (option: T) => void;
  emptyMessage?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        {value !== null && (
          <span
            className={`font-mono text-xs ${touched ? "text-accent" : "text-muted"}`}
          >
            {touched ? "changed" : "inherited"}
          </span>
        )}
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-muted">
          {emptyMessage ?? "No options configured."}
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {options.map((option) => {
            const selected = value !== null && option === value;
            return (
              <button
                key={optionLabel(option)}
                type="button"
                onClick={() => onSelect(option)}
                className={`
                  shrink-0 rounded-full border px-4 py-2.5 font-mono text-base transition-colors
                  ${
                    selected
                      ? touched
                        ? "border-accent bg-accent text-black"
                        : "border-muted-strong bg-surface-raised text-muted-strong"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }
                `}
              >
                {optionLabel(option)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

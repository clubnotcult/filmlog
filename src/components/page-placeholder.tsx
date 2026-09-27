import type { ReactNode } from "react";

export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">
        {title.toUpperCase()}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
      {phase && (
        <p className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-xs text-muted-strong">
          {phase}
        </p>
      )}
    </section>
  );
}

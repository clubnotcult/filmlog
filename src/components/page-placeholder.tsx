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
      <h1 className="text-3xl font-light tracking-tight text-foreground">
        {title.toUpperCase()}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
      {phase && (
        <p className="mt-6 border-l-2 border-border py-1 pl-4 text-xs text-muted-strong">
          {phase}
        </p>
      )}
    </section>
  );
}

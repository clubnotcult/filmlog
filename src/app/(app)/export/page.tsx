import { ExportButtons } from "./export-buttons";

export default function ExportPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-mono text-xl tracking-[0.15em] text-foreground">EXPORT</h1>
      <p className="mt-2 text-sm text-muted">
        Every frame across your archive — film stock, gear, exposure, meter
        type, evaluation, favorites, tags, and notes — in a few formats
        suited to different uses.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <h2 className="font-mono text-sm tracking-[0.15em] text-muted">CSV / JSON</h2>
          <p className="mt-1 text-xs text-muted">
            For spreadsheets or your own scripts — one row per frame.
          </p>
        </div>
        <div>
          <h2 className="font-mono text-sm tracking-[0.15em] text-muted">AI ANALYSIS EXPORT</h2>
          <p className="mt-1 text-xs text-muted">
            A compact, readable text format meant to be pasted directly into a
            conversation with an AI assistant — e.g. &ldquo;Analyze my
            shooting history and identify patterns.&rdquo;
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ExportButtons />
      </div>
    </div>
  );
}

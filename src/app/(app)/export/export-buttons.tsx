"use client";

import { useState, useTransition } from "react";
import { generateExport, type ExportFormat } from "./actions";

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportButtons() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleDownload(format: ExportFormat) {
    setError(null);
    startTransition(async () => {
      const result = await generateExport(format);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      downloadText(result.content, result.filename);
    });
  }

  function handleCopyForAi() {
    setError(null);
    startTransition(async () => {
      const result = await generateExport("ai");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => handleDownload("csv")}
          className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => handleDownload("json")}
          className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50"
        >
          Download JSON
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => handleDownload("ai")}
          className="label inline-flex h-10 items-center justify-center border border-border px-4 !text-muted-strong hover:!text-foreground disabled:opacity-50"
        >
          Download AI Analysis Export (.txt)
        </button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={handleCopyForAi}
        className="numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black disabled:opacity-50"
      >
        {copied ? "Copied!" : "Copy AI Analysis Export to clipboard"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

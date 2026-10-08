"use server";

import { createClient } from "@/lib/supabase/server";
import { gatherExportRows } from "@/lib/export/gather";
import { toCsv, toJson, toAiAnalysisText } from "@/lib/export/formats";

export type ExportFormat = "csv" | "json" | "ai";

export async function generateExport(
  format: ExportFormat,
): Promise<{ ok: true; content: string; filename: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const rows = await gatherExportRows(supabase);

  if (rows.length === 0) {
    return { ok: false, error: "No frames to export yet." };
  }

  const date = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return { ok: true, content: toCsv(rows), filename: `film-log-export-${date}.csv` };
  }
  if (format === "json") {
    return { ok: true, content: toJson(rows), filename: `film-log-export-${date}.json` };
  }
  return { ok: true, content: toAiAnalysisText(rows), filename: `film-log-ai-export-${date}.txt` };
}

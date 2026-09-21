import Link from "next/link";
import { formatExposureSummary } from "@/lib/exposure-format";
import type { Frame } from "@/lib/database.types";

/**
 * A single frame in the roll's grid browser. The square area above the
 * caption is reserved for a Phase 5 photo thumbnail — today it's a plain
 * placeholder, but the layout (aspect-square image area + caption below) is
 * exactly what a real thumbnail will drop into unchanged.
 */
export function FrameCard({
  frame,
  lensLabel,
  href,
}: {
  frame: Frame;
  lensLabel: string | null;
  href: string;
}) {
  const summary = frame.metadata_logged
    ? formatExposureSummary(frame, lensLabel)
    : null;

  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-md border border-border hover:border-accent"
    >
      <div className="flex aspect-square items-center justify-center bg-surface">
        {/* Thumbnail placeholder — replaced by the synced photo in Phase 5. */}
        <span className="font-mono text-xs text-muted">No photo yet</span>
      </div>
      <div className="px-2.5 py-2">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-xs text-muted-strong">
            #{frame.frame_number}
          </span>
          {frame.notes && (
            <span className="text-[10px] text-muted" title="Has a note">
              ●
            </span>
          )}
        </div>
        {summary ? (
          <p className="mt-0.5 truncate font-mono text-xs text-foreground">
            {summary}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted">No Exposure Data Recorded</p>
        )}
      </div>
    </Link>
  );
}

import type { RefreshStage } from "./refresh-run";

export type StageView = {
  /** What to tell the person. Null only for a quiet idle state with nothing to say. */
  text: string | null;
  tone: "muted" | "accent" | "danger";
  /** The app is working or waiting — there is nothing for the person to tap. */
  busy: boolean;
  /** The one thing worth tapping next, or null while busy. */
  action: string | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One wording for every stage, shared by the All Images control and the
 * per-roll button, so the two can't drift apart. Every stage resolves to
 * either "busy, and here's exactly what it's busy with" or "idle/finished,
 * and here's what you can do" — there is no state that is only a spinner.
 */
export function describeStage(
  stage: RefreshStage,
  context: { isUpdating: boolean; authNeeded: boolean; failedCount: number },
): StageView {
  switch (stage.kind) {
    case "authorizing":
      return { text: "Waiting for Google authorization…", tone: "muted", busy: true, action: null };
    case "finding":
      return { text: "Finding your rolls…", tone: "muted", busy: true, action: null };
    case "refreshing":
      return {
        text: `Refreshing image data · ${stage.completed} / ${stage.total}`,
        tone: "muted",
        busy: true,
        action: null,
      };
    case "done": {
      if (context.isUpdating) {
        return { text: "Updating library…", tone: "muted", busy: true, action: null };
      }
      // A finished run's summary is old news the moment something newer needs
      // the person: if Google access has since lapsed, that — and the button to
      // fix it — must not stay hidden behind "3 rolls refreshed".
      if (context.authNeeded) {
        return { text: "Google access needed", tone: "danger", busy: false, action: "Reconnect Google" };
      }
      const attention = stage.issues.length;
      const base =
        stage.updatedRolls === 0
          ? "Nothing needed refreshing"
          : `${plural(stage.updatedRolls, "roll", "rolls")} refreshed`;
      const withAttention =
        attention > 0 ? `${base} · ${attention} need${attention === 1 ? "s" : ""} attention` : base;
      // Images that still won't load after the refresh (a file removed from
      // Drive, say) are said plainly rather than left looking like success.
      if (context.failedCount > 0) {
        return {
          text: `${withAttention} · ${plural(context.failedCount, "image", "images")} still not loading`,
          tone: "danger",
          busy: false,
          action: "Refresh images",
        };
      }
      return {
        text: withAttention,
        tone: attention > 0 ? "danger" : "accent",
        busy: false,
        action: "Refresh images",
      };
    }
    case "nothing":
      return {
        text: "No rolls have a synced Drive folder yet.",
        tone: "muted",
        busy: false,
        action: null,
      };
    case "needs_auth": {
      const left = stage.notAttempted > 0 ? ` · ${plural(stage.notAttempted, "roll", "rolls")} not refreshed` : "";
      return {
        text: `${stage.message}${left}`,
        tone: "danger",
        busy: false,
        action: "Reconnect Google",
      };
    }
    case "failed":
      return { text: stage.message, tone: "danger", busy: false, action: "Try again" };
    case "idle": {
      if (context.authNeeded) {
        return { text: "Google access needed", tone: "danger", busy: false, action: "Reconnect Google" };
      }
      if (context.failedCount > 0) {
        return {
          text: `${plural(context.failedCount, "image needs", "images need")} refreshing`,
          tone: "accent",
          busy: false,
          action: "Refresh images",
        };
      }
      return { text: null, tone: "muted", busy: false, action: "Refresh images" };
    }
  }
}

/** Short reason shown beside a roll that needs attention. */
export function describeIssueKind(kind: string): string {
  switch (kind) {
    case "missing_folder":
      return "Drive folder not found";
    case "missing_files":
      return "Files missing from Drive";
    case "transient":
      return "Drive temporarily unavailable";
    case "auth":
      return "Google access expired";
    default:
      return "Couldn't refresh";
  }
}

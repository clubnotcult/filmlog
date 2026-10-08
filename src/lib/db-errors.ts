/**
 * Translates common Postgres error codes into messages a form can show
 * directly. The database is the real source of truth for these rules
 * (foreign keys, check constraints) — this just makes the resulting errors
 * readable instead of surfacing raw SQLSTATE text.
 */

type PostgresError = { code?: string; message?: string };

export function friendlyDbError(
  error: PostgresError,
  context: {
    /** Shown for a 23503 foreign_key_violation, e.g. "camera". */
    entityInUse?: string;
  } = {},
): string {
  switch (error.code) {
    case "23503": // foreign_key_violation
      return context.entityInUse
        ? `Can't delete this ${context.entityInUse} — it's used by one or more rolls. Deactivate it instead.`
        : "Can't delete this — it's still referenced by other records. Deactivate it instead.";
    case "23514": // check_violation (e.g. quantity >= 0)
      return "That change isn't allowed — it would make the quantity negative.";
    case "23505": // unique_violation
      return "That value is already in use.";
    default:
      return error.message ?? "Something went wrong. Please try again.";
  }
}

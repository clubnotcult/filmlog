/**
 * Central place to read the public Supabase environment variables.
 *
 * These two values are safe to expose to the browser (the anon key is designed
 * to be public and is only useful in combination with Row Level Security).
 * They are read lazily so that a missing configuration never breaks the build
 * or a bare `next dev` boot — it only surfaces when a client is actually
 * constructed at request time.
 */

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL " +
        "and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.local.example).",
    );
  }

  return { url, anonKey };
}

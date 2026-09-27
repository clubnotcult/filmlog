import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "./config";

/**
 * Supabase client for use in Server Components, Server Actions and Route
 * Handlers. Reads and writes the auth cookies via Next's cookie store.
 *
 * Because it awaits `cookies()`, any route that uses it is rendered
 * dynamically — which is what we want for authenticated pages.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` can be called from a Server Component, where cookies are
          // read-only. This is safe to ignore when middleware is refreshing
          // the session on every request.
        }
      },
    },
  });
}

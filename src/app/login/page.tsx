"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/active-roll";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const configured = hasSupabaseEnv();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Unable to sign in. Check your Supabase configuration.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-mono text-2xl tracking-[0.2em] text-foreground">
            FILM&nbsp;LOG
          </h1>
          <p className="mt-2 text-sm text-muted">Private film photography log</p>
        </div>

        {!configured && (
          <p className="mb-6 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-strong">
            Supabase is not configured yet. Add your credentials to{" "}
            <code className="font-mono text-accent">.env.local</code> and
            restart the dev server.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-xs text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-xs text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-fd-red">{error}</p>}

          <button
            type="submit"
            disabled={pending || !configured}
            className="w-full rounded-md bg-accent px-3 py-2 font-medium text-black transition-opacity disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

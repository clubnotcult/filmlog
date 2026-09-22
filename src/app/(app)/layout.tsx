import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

async function getUserEmail(): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const email = await getUserEmail();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Nav />

      <div className="flex flex-1 flex-col pb-16 md:pb-0">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="font-mono text-sm tracking-[0.15em] text-muted md:hidden">
            FILM&nbsp;LOG
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted">
            {email && <span className="hidden sm:inline">{email}</span>}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-muted-strong hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}

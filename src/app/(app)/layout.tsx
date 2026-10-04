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

      <div className="flex flex-1 flex-col pb-20 md:pb-0">
        <header className="flex h-12 items-center justify-between px-5 md:px-12">
          <span className="numeral text-xs uppercase tracking-[0.28em] text-muted md:invisible">
            Film&nbsp;Log
          </span>
          <div className="flex items-center gap-4">
            {email && <span className="label hidden !normal-case !tracking-normal sm:inline">{email}</span>}
            <form action="/auth/signout" method="post">
              <button type="submit" className="label h-11 hover:!text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-5 pb-8 pt-2 md:px-12 md:pt-4">{children}</main>
      </div>
    </div>
  );
}

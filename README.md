# Film Log

A private, personal web app for logging 35mm film photography — film inventory
plus live, frame-by-frame exposure logging while a roll is being shot.

This repository currently contains the **Phase 1 foundation only**: project
scaffold, Supabase integration, authentication, the application shell, and the
database schema. The gear/inventory/roll/active-roll features are not built yet.

## Stack

- **Next.js 16** (App Router, `src/`) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres + Auth) via `@supabase/ssr`
- Self-hosted **Geist** font (no build-time network dependency)
- Deploys to **Vercel**

## Prerequisites

- Node.js 20+ (developed on Node 22)
- A **Supabase project** (free tier is fine)

## 1. Install

    npm install

## 2. Configure environment

    cp .env.local.example .env.local

Fill in the two Supabase values from your project's dashboard
(**Project Settings -> API**):

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / public key |

`.env.local` is gitignored. Never commit secrets. (Google Drive credentials are
listed in the example file but are **not used yet** — they arrive in Phase 5.)

## 3. Apply the database schema

The schema lives in `supabase/migrations`. Apply it to your project with the
Supabase CLI (already installed as a dev dependency):

    # One-time: link this folder to your Supabase project
    npx supabase login
    npx supabase link --project-ref YOUR_PROJECT_REF

    # Push the migrations
    npx supabase db push

Alternatively, paste the contents of the two files in `supabase/migrations/`
(schema first, then RLS) into the Supabase SQL editor and run them in order.

> Note: these migrations reference `auth.users` and `auth.uid()`, so they are
> meant for a Supabase project (not a bare Postgres instance). Local
> `supabase start` requires Docker.

## 4. Create your user

This is a single-user app with no public sign-up. Create your account in the
Supabase dashboard: **Authentication -> Users -> Add user**, set an email and
password, and enable **auto-confirm** (or confirm the email). You'll sign in
with those credentials at `/login`.

## 5. Run

    npm run dev

Open http://localhost:3000 — you'll be redirected to `/login`, then to the app
shell (Active Roll / Rolls / Inventory / Gear) once signed in.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript typecheck |

## Project structure

    src/
      app/
        layout.tsx              # root layout, fonts, metadata
        page.tsx                # redirects -> /active-roll
        login/page.tsx          # sign-in (no public sign-up)
        auth/signout/route.ts   # POST sign-out
        (app)/                  # authenticated shell (nav + header)
          layout.tsx
          active-roll/page.tsx  # placeholder - Phase 3
          rolls/page.tsx        # placeholder - Phase 2/4
          inventory/page.tsx    # placeholder - Phase 2
          gear/page.tsx         # placeholder - Phase 1/2
      components/
        nav.tsx                 # bottom bar (mobile) / side rail (desktop)
        page-placeholder.tsx
      lib/
        database.types.ts       # hand-written DB types (regenerable via CLI)
        supabase/
          config.ts             # env reading + presence check
          client.ts             # browser client
          server.ts             # server-component / route-handler client
          middleware.ts         # session refresh + auth guard helper
      proxy.ts                  # Next 16 proxy (formerly "middleware")
    supabase/
      config.toml
      migrations/
        ..._init_schema.sql     # tables, constraints, triggers, indexes
        ..._rls_policies.sql    # RLS enable + owner-only policies

## Deploying to Vercel

Import the repo into Vercel and set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in the project's environment variables. No other
configuration is required for this phase.

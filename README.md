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

## Drive archive folders

A roll can create its Drive folder (`<archive root>/<year>/<dates>_<FilmStock>_<Locations>/{RAW,JPEG,SELECTS}`, e.g. `9.28_10.2_JHCStreetPan_ATX`) from the roll page.

- **Scope change:** this needs the full `https://www.googleapis.com/auth/drive` scope (Google's `files.create` accepts only `drive`, `drive.file` and `drive.appdata`, and `drive.file` cannot write into an existing year folder). In Google Cloud Console, add that scope to the OAuth consent screen, then tap Reconnect Google once.
- **Migration:** apply `supabase/migrations/20261008090000_drive_folder_structure.sql`.
- **Tests:** `npx tsx --test scripts/test-harness/drive-folders.test.ts` (fake Drive) and `scripts/test-harness/02_drive_folder_tests.sql` (Postgres, after `00_fake_auth.sql` and all migrations).

## Film classification

Film stocks carry a controlled **film type** (Color Negative, Black & White Negative, Color Slide, Black & White Reversal, Instant, Other) and an authoritative **format** (35mm, 120, Large Format, Half Frame, APS, Instant, Other). Both flow automatically into system tags (and so Drive descriptions), Explore and Library filters, and the AI export.

- **Migration:** `supabase/migrations/20261009090000_film_classification.sql`. Older stocks are classified from unambiguous names only; the rest stay "Needs classification" in the Film catalog until edited.
- **Tests:** `npx tsx --test scripts/test-harness/*.test.ts`; `scripts/test-harness/03_film_classification_tests.sql` (apply every migration except the classification one first; the script applies it itself against legacy data).

## Image-first archive

The Library is now the home of the app; the Active Roll shooting log is optional.

- **Workflow:** New roll (camera + film stock + start date; everything else optional) → optionally choose the roll's JPEG folder → a frame is created automatically for every image, in SmartConvert filename order → review, tag, ♥/★ → **Finish roll** (records the closing date; reopenable).
- **Import is idempotent:** re-importing or "Check for new images" keeps every existing frame (number, tags, selection, notes) by Drive file id, appends only new images, and reports — never deletes — images that disappeared from Drive. A shooting-log roll whose frames still need scans keeps using **Sync Photos** (positional match).
- **Roll defaults:** default lens (optional — unknown is never inferred), location and global tags apply to every frame that doesn't set its own. Inheritance is resolved at read time (`src/lib/effective-metadata.ts`), so changing a roll default never overwrites a frame's own value. Roll tags live in `roll_tags` and are never copied onto frames.
- **Cameras:** `exposure_control` (Manual / Aperture priority / Shutter priority / Automatic). Settings the camera chooses itself are not applicable: hidden in the UI, never required, stored as null.
- **Film cards:** each film stock can carry a small card (1–3 colors, rows or gradient, short text) stored as structured JSON in `film_stocks.card_design`, shown next to its rolls.
- **Migration:** `supabase/migrations/20261108090000_image_first_archive.sql` (additive; the old `create_roll` signature remains as a wrapper).
- **Tests:** `npx tsx --test scripts/test-harness/*.test.ts`; `scripts/test-harness/05_image_first_archive_tests.sql` (apply `00_fake_auth.sql` and every migration *before* 20261108090000 first — the script seeds legacy data and applies the new migration itself).

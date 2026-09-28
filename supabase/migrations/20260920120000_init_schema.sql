-- Film Log — initial schema
--
-- Entities: cameras, lenses, film_stocks, rolls, frames.
-- Targets a Supabase project (references auth.users and auth.uid()).
--
-- Design notes:
--  * Every table carries user_id (defaults to auth.uid()) so the app is private
--    now but can support multiple users later without a schema change.
--  * Frames store their OWN exposure snapshot (shutter/aperture/lens). Historical
--    frame data must never be recomputed from current roll state (spec §28).
--  * shutter_speeds are text (values like 'B', '1', '1/125' are not all numeric);
--    apertures are numeric so future filtering like "all photos at f/2.8" is clean.
--  * Lists (shutter_speeds, aperture_stops) are ordered arrays so the on-screen
--    dial/ring order is preserved.

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- Roll lifecycle: a roll is either being shot or deliberately finished (spec §2).
create type public.roll_status as enum ('active', 'completed');

-- Shared updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- cameras
-- ---------------------------------------------------------------------------
create table public.cameras (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null,
  format         text,
  shutter_speeds text[] not null default '{}',      -- ordered, e.g. {B,1,1/2,...,1/1000}
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lenses
-- ---------------------------------------------------------------------------
create table public.lenses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null,
  focal_length   text,                              -- text to allow primes ("50") and zooms ("24-70")
  min_aperture   numeric(4,1),
  max_aperture   numeric(4,1),
  aperture_stops numeric(4,1)[] not null default '{}', -- ordered, e.g. {2.8,4,5.6,8,11,16}
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- film_stocks
-- ---------------------------------------------------------------------------
create table public.film_stocks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null,
  iso             integer check (iso is null or iso > 0),
  format          text,
  quantity        integer not null default 0 check (quantity >= 0),
  expiration_date date,
  storage_notes   text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- rolls
-- ---------------------------------------------------------------------------
create table public.rolls (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  film_stock_id   uuid not null references public.film_stocks (id) on delete restrict,
  camera_id       uuid not null references public.cameras (id) on delete restrict,
  default_lens_id uuid not null references public.lenses (id) on delete restrict,
  start_date      date not null,
  end_date        date,                             -- null while active; set on finish (spec §16)
  custom_title    text,
  status          public.roll_status not null default 'active',
  current_frame   integer not null default 1 check (current_frame >= 1),
  drive_folder_id text,                             -- Google Drive folder ref (populated in Phase 5)
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint rolls_end_after_start check (end_date is null or end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- frames
-- ---------------------------------------------------------------------------
-- Each frame holds its own final exposure values (spec §28). lens_id records the
-- actual lens used on that frame so historical data stays independent (spec §13).
create table public.frames (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  roll_id        uuid not null references public.rolls (id) on delete cascade,
  frame_number   integer not null check (frame_number >= 1),
  shutter_speed  text,
  aperture       numeric(4,1),
  lens_id        uuid references public.lenses (id) on delete restrict,
  notes          text,
  drive_file_id  text,                              -- Google Drive file ref (Phase 5)
  drive_filename text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint frames_unique_number_per_roll unique (roll_id, frame_number)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger set_cameras_updated_at     before update on public.cameras     for each row execute function public.set_updated_at();
create trigger set_lenses_updated_at      before update on public.lenses      for each row execute function public.set_updated_at();
create trigger set_film_stocks_updated_at before update on public.film_stocks for each row execute function public.set_updated_at();
create trigger set_rolls_updated_at       before update on public.rolls       for each row execute function public.set_updated_at();
create trigger set_frames_updated_at      before update on public.frames      for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
-- Per-user access (RLS predicate + listing).
create index idx_cameras_user     on public.cameras (user_id);
create index idx_lenses_user      on public.lenses (user_id);
create index idx_film_stocks_user on public.film_stocks (user_id);
create index idx_rolls_user       on public.rolls (user_id);
create index idx_frames_user      on public.frames (user_id);

-- Roll foreign keys + common queries.
create index idx_rolls_film_stock   on public.rolls (film_stock_id);
create index idx_rolls_camera       on public.rolls (camera_id);
create index idx_rolls_default_lens on public.rolls (default_lens_id);
create index idx_rolls_status       on public.rolls (user_id, status);   -- find the active roll
create index idx_rolls_start_date   on public.rolls (start_date desc);   -- chronological library

-- Frame foreign keys + future filtering (spec §24).
create index idx_frames_roll     on public.frames (roll_id);
create index idx_frames_lens     on public.frames (lens_id);
create index idx_frames_aperture on public.frames (aperture);
create index idx_frames_shutter  on public.frames (shutter_speed);

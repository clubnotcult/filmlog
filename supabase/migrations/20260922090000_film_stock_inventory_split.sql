-- Film Log — Phase 3 preamble: split film stock into reusable type + physical
-- inventory item.
--
-- Phase 2's film_stocks table conflated two different things: the reusable
-- film TYPE (name/ISO/format — the info that's identical every time you buy
-- more of the same film) and a specific physical batch the user owns
-- (quantity/expiration/storage notes — which varies roll to roll). This
-- migration splits them:
--
--   film_stocks           -> reusable type only (name, iso, format, notes, active)
--   film_inventory_items  -> a physical batch of that type (film_stock_id,
--                             quantity, expiration_date, storage_notes)
--
-- Existing data is preserved, not reset: every existing film_stocks row gets
-- exactly one film_inventory_items row carrying over its quantity/expiration/
-- storage_notes, and every existing roll is re-pointed at that new inventory
-- item. Nothing is deleted; this only relocates columns and backfills
-- references.

-- The old functions read/write columns this migration removes from
-- film_stocks. Drop them now; migration 20260922090200 recreates equivalents
-- against the new table. (Function bodies aren't validated against schema at
-- CREATE time, so this ordering is a clarity choice, not a strict necessity —
-- but it avoids ever leaving a function whose body silently no longer matches
-- reality.)
drop function if exists public.create_roll(uuid, uuid, uuid, date, text, text);
drop function if exists public.adjust_film_stock_quantity(uuid, integer);

-- ---------------------------------------------------------------------------
-- 1. New table: film_inventory_items
-- ---------------------------------------------------------------------------
create table public.film_inventory_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  film_stock_id   uuid not null references public.film_stocks (id) on delete restrict,
  expiration_date date,
  storage_notes   text,
  quantity        integer not null default 0 check (quantity >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_film_inventory_items_updated_at
  before update on public.film_inventory_items
  for each row execute function public.set_updated_at();

create index idx_film_inventory_items_user        on public.film_inventory_items (user_id);
create index idx_film_inventory_items_film_stock   on public.film_inventory_items (film_stock_id);

alter table public.film_inventory_items enable row level security;

create policy "film_inventory_items_select_own" on public.film_inventory_items
  for select to authenticated using (auth.uid() = user_id);
create policy "film_inventory_items_insert_own" on public.film_inventory_items
  for insert to authenticated with check (auth.uid() = user_id);
create policy "film_inventory_items_update_own" on public.film_inventory_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "film_inventory_items_delete_own" on public.film_inventory_items
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Backfill: one inventory item per existing film stock, carrying over its
--    quantity / expiration_date / storage_notes and original timestamps.
-- ---------------------------------------------------------------------------
insert into public.film_inventory_items
  (user_id, film_stock_id, expiration_date, storage_notes, quantity, created_at, updated_at)
select user_id, id, expiration_date, storage_notes, quantity, created_at, updated_at
from public.film_stocks;

-- ---------------------------------------------------------------------------
-- 3. rolls: record which physical item was consumed, alongside the existing
--    film_stock_id (kept — see note below). Backfilled from the 1:1 mapping
--    the insert above just created (at this instant every film_stock_id has
--    exactly one matching inventory item), then made required.
-- ---------------------------------------------------------------------------
alter table public.rolls
  add column film_inventory_item_id uuid references public.film_inventory_items (id) on delete restrict;

update public.rolls r
set film_inventory_item_id = fi.id
from public.film_inventory_items fi
where fi.film_stock_id = r.film_stock_id;

alter table public.rolls
  alter column film_inventory_item_id set not null;

create index idx_rolls_film_inventory_item on public.rolls (film_inventory_item_id);

-- rolls.film_stock_id is intentionally kept, not dropped: which film TYPE a
-- roll was shot on never changes once the roll exists, so it's a safe,
-- permanent denormalization that keeps roll list/detail queries and the
-- future-search indexes from spec §24 ("all rolls shot on Portra 400") a
-- single-hop lookup instead of a join through film_inventory_items.

-- ---------------------------------------------------------------------------
-- 4. film_stocks: drop the columns that now live on film_inventory_items.
--    (Their check constraint is dropped automatically along with the column.)
-- ---------------------------------------------------------------------------
alter table public.film_stocks
  drop column quantity,
  drop column expiration_date,
  drop column storage_notes;

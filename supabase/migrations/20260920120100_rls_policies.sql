-- Film Log — Row Level Security
--
-- Every table is owner-scoped: an authenticated user can only read or write
-- rows whose user_id matches their auth.uid(). Combined with the
-- `user_id default auth.uid()` column default, inserts automatically belong to
-- the caller. The app is single-user today; this design lets additional users
-- be added later with no schema change.

alter table public.cameras     enable row level security;
alter table public.lenses      enable row level security;
alter table public.film_stocks enable row level security;
alter table public.rolls       enable row level security;
alter table public.frames      enable row level security;

-- cameras
create policy "cameras_select_own" on public.cameras
  for select to authenticated using (auth.uid() = user_id);
create policy "cameras_insert_own" on public.cameras
  for insert to authenticated with check (auth.uid() = user_id);
create policy "cameras_update_own" on public.cameras
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cameras_delete_own" on public.cameras
  for delete to authenticated using (auth.uid() = user_id);

-- lenses
create policy "lenses_select_own" on public.lenses
  for select to authenticated using (auth.uid() = user_id);
create policy "lenses_insert_own" on public.lenses
  for insert to authenticated with check (auth.uid() = user_id);
create policy "lenses_update_own" on public.lenses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lenses_delete_own" on public.lenses
  for delete to authenticated using (auth.uid() = user_id);

-- film_stocks
create policy "film_stocks_select_own" on public.film_stocks
  for select to authenticated using (auth.uid() = user_id);
create policy "film_stocks_insert_own" on public.film_stocks
  for insert to authenticated with check (auth.uid() = user_id);
create policy "film_stocks_update_own" on public.film_stocks
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "film_stocks_delete_own" on public.film_stocks
  for delete to authenticated using (auth.uid() = user_id);

-- rolls
create policy "rolls_select_own" on public.rolls
  for select to authenticated using (auth.uid() = user_id);
create policy "rolls_insert_own" on public.rolls
  for insert to authenticated with check (auth.uid() = user_id);
create policy "rolls_update_own" on public.rolls
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rolls_delete_own" on public.rolls
  for delete to authenticated using (auth.uid() = user_id);

-- frames
create policy "frames_select_own" on public.frames
  for select to authenticated using (auth.uid() = user_id);
create policy "frames_insert_own" on public.frames
  for insert to authenticated with check (auth.uid() = user_id);
create policy "frames_update_own" on public.frames
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "frames_delete_own" on public.frames
  for delete to authenticated using (auth.uid() = user_id);

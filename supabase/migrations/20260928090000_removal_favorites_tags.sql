-- Film Log — Phase 9: frame removal, exposure evaluation, favorites, tags.
--
-- Exposure evaluation and favorite are deliberately NOT added to the
-- "unlogged frame has no exposure data" constraint from Phase 4/8. That
-- constraint exists to stop a frame from looking like it has real shutter/
-- aperture/meter values it doesn't. Exposure evaluation and favorite status
-- are judgments about the RESULT (how the photo came out, whether you like
-- it) — you can make that judgment from the image itself even with zero
-- memory of what settings were used, so they're allowed on unlogged frames.

alter table public.frames
  add column exposure_evaluation text
    check (exposure_evaluation in ('Too Dark', 'Too Bright', 'Correct', 'Unknown'));

alter table public.frames
  add column is_favorite boolean not null default false;

create index idx_frames_exposure_evaluation on public.frames (exposure_evaluation);
create index idx_frames_is_favorite on public.frames (user_id, is_favorite) where is_favorite;

-- ---------------------------------------------------------------------------
-- Tags: reusable per user (create once, apply many times), many-to-many with
-- frames via frame_tags. A tag is scoped to its owner, matching every other
-- table — nobody else's tag names are visible or reusable.
-- ---------------------------------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.frame_tags (
  frame_id   uuid not null references public.frames (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (frame_id, tag_id)
);

create index idx_frame_tags_tag on public.frame_tags (tag_id, frame_id);

alter table public.tags enable row level security;
alter table public.frame_tags enable row level security;

create policy "tags_select_own" on public.tags
  for select to authenticated using (auth.uid() = user_id);
create policy "tags_insert_own" on public.tags
  for insert to authenticated with check (auth.uid() = user_id);
create policy "tags_update_own" on public.tags
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tags_delete_own" on public.tags
  for delete to authenticated using (auth.uid() = user_id);

create policy "frame_tags_select_own" on public.frame_tags
  for select to authenticated using (auth.uid() = user_id);
create policy "frame_tags_insert_own" on public.frame_tags
  for insert to authenticated with check (auth.uid() = user_id);
create policy "frame_tags_delete_own" on public.frame_tags
  for delete to authenticated using (auth.uid() = user_id);
-- No update policy: a frame_tags row is just a link; changing it means
-- deleting and re-adding, not editing in place.

-- ---------------------------------------------------------------------------
-- get_or_create_tag: the autocomplete/reuse path. Looks up an existing tag
-- by name (case-insensitive) before creating a new one, so typing "Julian"
-- twice never creates two tags that then have to be reconciled later.
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_tag(p_name text)
returns public.tags
language plpgsql
security invoker
as $$
declare
  v_name text := trim(p_name);
  v_tag  public.tags;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select * into v_tag from public.tags
  where user_id = auth.uid() and lower(name) = lower(v_name);

  if found then
    return v_tag;
  end if;

  insert into public.tags (name) values (v_name)
  returning * into v_tag;

  return v_tag;
end;
$$;

grant execute on function public.get_or_create_tag(text) to authenticated;
revoke execute on function public.get_or_create_tag(text) from anon, public;

-- ---------------------------------------------------------------------------
-- bulk_tag_frames: applies one tag (by name — reusing get_or_create_tag) to
-- many frames at once. Ownership is checked per frame via the frame_tags
-- insert policy itself (user_id default + RLS), and ON CONFLICT DO NOTHING
-- makes this safe to call repeatedly on overlapping frame sets — applying an
-- already-applied tag again is a no-op, never a duplicate-row error.
-- ---------------------------------------------------------------------------
create or replace function public.bulk_tag_frames(p_frame_ids uuid[], p_tag_name text)
returns integer
language plpgsql
security invoker
as $$
declare
  v_tag public.tags;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_tag := public.get_or_create_tag(p_tag_name);

  insert into public.frame_tags (frame_id, tag_id)
  select f.id, v_tag.id
  from public.frames f
  where f.id = any(p_frame_ids) and f.user_id = auth.uid()
  on conflict (frame_id, tag_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.bulk_tag_frames(uuid[], text) to authenticated;
revoke execute on function public.bulk_tag_frames(uuid[], text) from anon, public;

-- ---------------------------------------------------------------------------
-- remove_last_frame: the fast-path mistake-correction workflow. Always
-- targets whichever frame actually has the highest frame_number for this
-- roll — computed fresh here, never passed in by the caller — so "only the
-- newest frame can be removed instantly" is enforced by the function's own
-- logic, not just by a UI that could be bypassed. Rolls current_frame back
-- down to the removed frame's own number, so the next save reuses it.
-- ---------------------------------------------------------------------------
create or replace function public.remove_last_frame(p_roll_id uuid)
returns public.frames
language plpgsql
security invoker
as $$
declare
  v_roll  public.rolls;
  v_frame public.frames;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_roll
  from public.rolls
  where id = p_roll_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Roll not found';
  end if;

  select * into v_frame
  from public.frames
  where roll_id = p_roll_id and user_id = auth.uid()
  order by frame_number desc
  limit 1
  for update;

  if not found then
    raise exception 'This roll has no frames to remove';
  end if;

  delete from public.frames where id = v_frame.id;

  update public.rolls
  set current_frame = v_frame.frame_number
  where id = p_roll_id;

  return v_frame;
end;
$$;

grant execute on function public.remove_last_frame(uuid) to authenticated;
revoke execute on function public.remove_last_frame(uuid) from anon, public;

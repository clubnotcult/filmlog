-- Film Log — location metadata.
--
-- Architecture choice: location is a per-FRAME field (frames.location_id),
-- inheriting forward exactly the way lens already does — the Shooter's
-- baseline for a new frame is "whatever the last LOGGED frame had", with no
-- separate roll-level default column. This deliberately mirrors lens/meter
-- rather than introducing a new inheritance mechanism, and avoids touching
-- roll creation at all: "Start Roll → Location: Austin" is simply setting
-- Frame 1's location, which then inherits forward exactly like any other
-- field — nothing about roll creation needed to change for that.
--
-- locations is a reusable library exactly like tags: create once, reuse via
-- autocomplete, case-insensitive lookup on create so "Austin" typed twice
-- never produces two rows (the same problem the spec calls out — "ATX" /
-- "Austin" / "Austin, TX" all meaning one place — is solved by reuse, not by
-- normalization of free text).
create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create trigger set_locations_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

alter table public.locations enable row level security;

create policy "locations_select_own" on public.locations
  for select to authenticated using (auth.uid() = user_id);
create policy "locations_insert_own" on public.locations
  for insert to authenticated with check (auth.uid() = user_id);
create policy "locations_update_own" on public.locations
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "locations_delete_own" on public.locations
  for delete to authenticated using (auth.uid() = user_id);

alter table public.frames
  add column location_id uuid references public.locations (id) on delete set null;

create index idx_frames_location on public.frames (location_id);

-- ---------------------------------------------------------------------------
-- get_or_create_location: same reuse-by-name pattern as get_or_create_tag.
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_location(p_name text)
returns public.locations
language plpgsql
security invoker
as $$
declare
  v_name text := trim(p_name);
  v_loc  public.locations;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_name = '' then
    raise exception 'Location name cannot be empty';
  end if;

  select * into v_loc from public.locations
  where user_id = auth.uid() and lower(name) = lower(v_name);

  if found then
    return v_loc;
  end if;

  insert into public.locations (name) values (v_name)
  returning * into v_loc;

  return v_loc;
end;
$$;

grant execute on function public.get_or_create_location(text) to authenticated;
revoke execute on function public.get_or_create_location(text) from anon, public;

-- ---------------------------------------------------------------------------
-- save_frame_and_advance / update_frame: add p_location_id, forced to null
-- for unlogged frames like every other exposure-adjacent field. Location is
-- NOT added to the frames_unlogged_has_no_exposure_data constraint for the
-- same reason favorite/exposure_evaluation weren't in Phase 9: it's a fact
-- about where you were standing, not a measurement of the shot, so it's
-- allowed to be known even when the exposure itself wasn't logged. It IS,
-- however, still cleared to null on an unlogged save/update here, matching
-- meter_type's treatment — consistent with "no metadata was actively
-- entered for this frame" rather than carrying over a stray value.
-- ---------------------------------------------------------------------------
drop function if exists public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text, boolean, text);

create or replace function public.save_frame_and_advance(
  p_roll_id         uuid,
  p_shutter_speed   text,
  p_aperture        numeric,
  p_lens_id         uuid,
  p_push_pull       numeric default 0,
  p_notes           text default null,
  p_metadata_logged boolean default true,
  p_meter_type      text default null,
  p_location_id     uuid default null
)
returns public.frames
language plpgsql
security invoker
as $$
declare
  v_roll           public.rolls;
  v_next_frame     integer;
  v_frame          public.frames;
  v_aperture_stops numeric[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_metadata_logged then
    if p_shutter_speed is null or length(trim(p_shutter_speed)) = 0 then
      raise exception 'Shutter speed is required';
    end if;

    if p_aperture is null then
      raise exception 'Aperture is required';
    end if;

    if p_lens_id is null then
      raise exception 'Lens is required';
    end if;

    select aperture_stops into v_aperture_stops
    from public.lenses
    where id = p_lens_id and user_id = auth.uid();

    if v_aperture_stops is null then
      raise exception 'Lens not found';
    end if;

    if not (p_aperture = any(v_aperture_stops)) then
      raise exception 'This lens does not support that aperture';
    end if;

    if p_meter_type is not null
       and p_meter_type not in ('In Camera Meter', 'KEKS Meter', 'Meter App', 'No Meter', 'Other') then
      raise exception 'Unrecognized meter type';
    end if;
  end if;

  select * into v_roll
  from public.rolls
  where id = p_roll_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Roll not found';
  end if;

  if v_roll.status <> 'active' then
    raise exception 'This roll is not active';
  end if;

  select coalesce(max(frame_number), 0) + 1 into v_next_frame
  from public.frames
  where roll_id = p_roll_id;

  insert into public.frames (
    user_id, roll_id, frame_number, shutter_speed, aperture, lens_id, push_pull, notes,
    metadata_logged, meter_type, location_id
  ) values (
    auth.uid(),
    p_roll_id,
    v_next_frame,
    case when p_metadata_logged then p_shutter_speed else null end,
    case when p_metadata_logged then p_aperture else null end,
    case when p_metadata_logged then p_lens_id else null end,
    case when p_metadata_logged then coalesce(p_push_pull, 0) else null end,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_metadata_logged,
    case when p_metadata_logged then p_meter_type else null end,
    case when p_metadata_logged then p_location_id else null end
  )
  returning * into v_frame;

  update public.rolls
  set current_frame = v_next_frame + 1
  where id = p_roll_id;

  return v_frame;
end;
$$;

grant execute on function public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text, boolean, text, uuid) to authenticated;
revoke execute on function public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text, boolean, text, uuid) from anon, public;

drop function if exists public.update_frame(uuid, boolean, text, numeric, uuid, numeric, text, text);

create or replace function public.update_frame(
  p_frame_id        uuid,
  p_metadata_logged boolean,
  p_shutter_speed   text default null,
  p_aperture        numeric default null,
  p_lens_id         uuid default null,
  p_push_pull       numeric default null,
  p_notes           text default null,
  p_meter_type      text default null,
  p_location_id     uuid default null
)
returns public.frames
language plpgsql
security invoker
as $$
declare
  v_frame          public.frames;
  v_aperture_stops numeric[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_metadata_logged then
    if p_shutter_speed is null or length(trim(p_shutter_speed)) = 0 then
      raise exception 'Shutter speed is required';
    end if;

    if p_aperture is null then
      raise exception 'Aperture is required';
    end if;

    if p_lens_id is null then
      raise exception 'Lens is required';
    end if;

    select aperture_stops into v_aperture_stops
    from public.lenses
    where id = p_lens_id and user_id = auth.uid();

    if v_aperture_stops is null then
      raise exception 'Lens not found';
    end if;

    if not (p_aperture = any(v_aperture_stops)) then
      raise exception 'This lens does not support that aperture';
    end if;

    if p_meter_type is not null
       and p_meter_type not in ('In Camera Meter', 'KEKS Meter', 'Meter App', 'No Meter', 'Other') then
      raise exception 'Unrecognized meter type';
    end if;

    update public.frames
    set metadata_logged = true,
        shutter_speed = p_shutter_speed,
        aperture = p_aperture,
        lens_id = p_lens_id,
        push_pull = coalesce(p_push_pull, 0),
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        meter_type = p_meter_type,
        location_id = p_location_id
    where id = p_frame_id and user_id = auth.uid()
    returning * into v_frame;
  else
    update public.frames
    set metadata_logged = false,
        shutter_speed = null,
        aperture = null,
        lens_id = null,
        push_pull = null,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        meter_type = null,
        location_id = null
    where id = p_frame_id and user_id = auth.uid()
    returning * into v_frame;
  end if;

  if not found then
    raise exception 'Frame not found';
  end if;

  return v_frame;
end;
$$;

grant execute on function public.update_frame(uuid, boolean, text, numeric, uuid, numeric, text, text, uuid) to authenticated;
revoke execute on function public.update_frame(uuid, boolean, text, numeric, uuid, numeric, text, text, uuid) from anon, public;

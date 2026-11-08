-- Film Log — image-first archive.
--
-- The app's centre of gravity moves from the Active Roll shooting log to the
-- archive: create a roll, import its JPEGs, review and organise. Every change
-- here is additive or a relaxation of an existing rule; nothing is deleted
-- and no existing row is rewritten except where noted.
--
--  1. rolls.default_lens_id becomes optional. "No default lens" means the lens
--     is unknown for any frame that doesn't name its own — never inferred.
--  2. rolls.film_inventory_item_id becomes optional, and rolls can be created
--     from a film stock directly. Starting a roll from inventory still
--     consumes one unit exactly as before; importing an old roll you shot
--     years ago no longer requires pretending you have it in the fridge.
--  3. rolls.location_id: a roll-level default location, inherited by frames
--     that don't set their own (frames.location_id stays the override).
--  4. roll_tags: global user tags on a roll. They are never copied onto
--     frames — a frame's effective tags are (roll_tags ∪ frame_tags), worked
--     out at read time — so removing a roll tag can never touch a tag that was
--     also assigned to a frame directly.
--  5. cameras.exposure_control: which exposure settings the camera lets you
--     choose. 'automatic' (compact cameras like the Olympus AF-1) means
--     shutter and aperture are not applicable and are never required.
--     Existing cameras default to 'manual' — exactly today's behaviour.
--  6. film_stocks.card_design: the structured film card (colours, layout,
--     text). Null = no custom card; the app shows a restrained default.
--  7. Lens no longer counts as "exposure data" on an unlogged frame, so an
--     imported frame can carry an explicit lens override (frame 12 shot on
--     the 28mm) without anyone inventing a shutter speed for it.
--  8. create_roll / save_frame_and_advance / update_frame learn the above.
--  9. finish_roll takes the closing date from the caller (the person's own
--     local date) instead of the database server's UTC current_date, which
--     shifted evening finishes in the Americas onto the next day.
-- 10. import_roll_images replaces import_roll_frames: one frame per JPEG,
--     idempotent by Drive file id, safe to run again on the same folder.

-- ---------------------------------------------------------------------------
-- 1–3. rolls
-- ---------------------------------------------------------------------------
alter table public.rolls alter column default_lens_id drop not null;
alter table public.rolls alter column film_inventory_item_id drop not null;

alter table public.rolls
  add column location_id uuid references public.locations (id) on delete set null;

create index idx_rolls_location on public.rolls (location_id);

-- ---------------------------------------------------------------------------
-- 4. roll_tags
-- ---------------------------------------------------------------------------
create table public.roll_tags (
  roll_id    uuid not null references public.rolls (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (roll_id, tag_id)
);

create index idx_roll_tags_tag on public.roll_tags (tag_id, roll_id);

alter table public.roll_tags enable row level security;

create policy "roll_tags_select_own" on public.roll_tags
  for select to authenticated using (auth.uid() = user_id);
create policy "roll_tags_insert_own" on public.roll_tags
  for insert to authenticated with check (auth.uid() = user_id);
create policy "roll_tags_delete_own" on public.roll_tags
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, delete on public.roll_tags to authenticated;

-- ---------------------------------------------------------------------------
-- 5. cameras.exposure_control
-- ---------------------------------------------------------------------------
alter table public.cameras
  add column exposure_control text not null default 'manual'
    check (exposure_control in ('manual', 'aperture_priority', 'shutter_priority', 'automatic'));

comment on column public.cameras.exposure_control is
  'Which exposure settings the photographer chooses: manual = shutter + aperture; aperture_priority = aperture only; shutter_priority = shutter only; automatic = neither (compact point-and-shoot). Settings the camera chooses itself are not applicable and never required.';

-- ---------------------------------------------------------------------------
-- 6. film_stocks.card_design
-- ---------------------------------------------------------------------------
alter table public.film_stocks
  add column card_design jsonb
    check (card_design is null or jsonb_typeof(card_design) = 'object');

comment on column public.film_stocks.card_design is
  'Film card: {version, colors[1..3 hex], layout rows|gradient, direction horizontal|vertical, text, textPosition, textTone}. Null = no custom card.';

-- ---------------------------------------------------------------------------
-- 7. Lens may be set on an unlogged frame
-- ---------------------------------------------------------------------------
alter table public.frames drop constraint frames_unlogged_has_no_exposure_data;
alter table public.frames add constraint frames_unlogged_has_no_exposure_data check (
  metadata_logged = true
  or (shutter_speed is null and aperture is null and push_pull is null and meter_type is null)
);

-- ---------------------------------------------------------------------------
-- 8a. create_roll
-- ---------------------------------------------------------------------------
drop function if exists public.create_roll(uuid, uuid, uuid, date, text, text);

create or replace function public.create_roll(
  p_film_stock_id          uuid,
  p_camera_id              uuid,
  p_start_date             date,
  p_film_inventory_item_id uuid default null,
  p_default_lens_id        uuid default null,
  p_custom_title           text default null,
  p_notes                  text default null,
  p_location_id            uuid default null,
  p_tag_names              text[] default '{}'
)
returns public.rolls
language plpgsql
security invoker
as $$
declare
  v_quantity       integer;
  v_item_stock_id  uuid;
  v_roll           public.rolls;
  v_tag_name       text;
  v_tag            public.tags;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_start_date is null then
    raise exception 'Start date is required';
  end if;

  if not exists (
    select 1 from public.film_stocks where id = p_film_stock_id and user_id = auth.uid()
  ) then
    raise exception 'Film stock not found';
  end if;

  if not exists (
    select 1 from public.cameras where id = p_camera_id and user_id = auth.uid()
  ) then
    raise exception 'Camera not found';
  end if;

  if p_default_lens_id is not null and not exists (
    select 1 from public.lenses where id = p_default_lens_id and user_id = auth.uid()
  ) then
    raise exception 'Lens not found';
  end if;

  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and user_id = auth.uid()
  ) then
    raise exception 'Location not found';
  end if;

  -- Consuming inventory is optional. When a physical item is named it must be
  -- a batch of the chosen stock, and it is locked + decremented atomically
  -- with the insert, exactly as before.
  if p_film_inventory_item_id is not null then
    select quantity, film_stock_id into v_quantity, v_item_stock_id
    from public.film_inventory_items
    where id = p_film_inventory_item_id and user_id = auth.uid()
    for update;

    if not found then
      raise exception 'Film inventory item not found';
    end if;

    if v_item_stock_id <> p_film_stock_id then
      raise exception 'That inventory item is a different film stock';
    end if;

    if v_quantity < 1 then
      raise exception 'No units of this film remain in inventory';
    end if;

    update public.film_inventory_items
    set quantity = quantity - 1
    where id = p_film_inventory_item_id and user_id = auth.uid();
  end if;

  insert into public.rolls (
    user_id, film_stock_id, film_inventory_item_id, camera_id, default_lens_id,
    start_date, custom_title, notes, location_id
  ) values (
    auth.uid(), p_film_stock_id, p_film_inventory_item_id, p_camera_id, p_default_lens_id,
    p_start_date, nullif(trim(p_custom_title), ''), nullif(trim(p_notes), ''), p_location_id
  )
  returning * into v_roll;

  foreach v_tag_name in array coalesce(p_tag_names, '{}')
  loop
    if trim(v_tag_name) <> '' then
      v_tag := public.get_or_create_tag(v_tag_name);
      insert into public.roll_tags (roll_id, tag_id)
      values (v_roll.id, v_tag.id)
      on conflict (roll_id, tag_id) do nothing;
    end if;
  end loop;

  return v_roll;
end;
$$;

grant execute on function public.create_roll(uuid, uuid, date, uuid, uuid, text, text, uuid, text[]) to authenticated;
revoke execute on function public.create_roll(uuid, uuid, date, uuid, uuid, text, text, uuid, text[]) from anon, public;

-- Legacy signature (inventory item first, lens required), kept as a thin
-- wrapper so a build deployed before this migration — and the existing SQL
-- test harness — keep working unchanged. Its argument names don't overlap
-- the new function's required set, so PostgREST never finds them ambiguous.
create or replace function public.create_roll(
  p_film_inventory_item_id uuid,
  p_camera_id              uuid,
  p_default_lens_id        uuid,
  p_start_date             date,
  p_custom_title           text default null,
  p_notes                  text default null
)
returns public.rolls
language plpgsql
security invoker
as $$
declare
  v_film_stock_id uuid;
begin
  if p_default_lens_id is null then
    raise exception 'Lens not found';
  end if;
  select film_stock_id into v_film_stock_id
  from public.film_inventory_items
  where id = p_film_inventory_item_id and user_id = auth.uid();
  if v_film_stock_id is null then
    raise exception 'Film inventory item not found';
  end if;
  return public.create_roll(
    p_film_stock_id          => v_film_stock_id,
    p_camera_id              => p_camera_id,
    p_start_date             => p_start_date,
    p_film_inventory_item_id => p_film_inventory_item_id,
    p_default_lens_id        => p_default_lens_id,
    p_custom_title           => p_custom_title,
    p_notes                  => p_notes);
end;
$$;

grant execute on function public.create_roll(uuid, uuid, uuid, date, text, text) to authenticated;
revoke execute on function public.create_roll(uuid, uuid, uuid, date, text, text) from anon, public;

-- ---------------------------------------------------------------------------
-- 8b. Shared validation for a logged frame's exposure, aware of what the
--     roll's camera actually lets you set. Returns the values to store:
--     settings the camera chooses itself are forced to null (not applicable),
--     never invented.
-- ---------------------------------------------------------------------------
create or replace function public.validate_frame_exposure(
  p_roll_id       uuid,
  p_shutter_speed text,
  p_aperture      numeric,
  p_lens_id       uuid,
  p_meter_type    text,
  out o_shutter_speed text,
  out o_aperture      numeric
)
language plpgsql
security invoker
as $$
declare
  v_control        text;
  v_aperture_stops numeric[];
begin
  select c.exposure_control into v_control
  from public.rolls r
  join public.cameras c on c.id = r.camera_id
  where r.id = p_roll_id and r.user_id = auth.uid();

  if v_control is null then
    raise exception 'Roll not found';
  end if;

  if v_control in ('manual', 'shutter_priority') then
    if p_shutter_speed is null or length(trim(p_shutter_speed)) = 0 then
      raise exception 'Shutter speed is required';
    end if;
    o_shutter_speed := p_shutter_speed;
  else
    o_shutter_speed := null;
  end if;

  if v_control in ('manual', 'aperture_priority') then
    if p_aperture is null then
      raise exception 'Aperture is required';
    end if;
    if p_lens_id is null then
      raise exception 'Lens is required';
    end if;
    select aperture_stops into v_aperture_stops
    from public.lenses where id = p_lens_id and user_id = auth.uid();
    if v_aperture_stops is null then
      raise exception 'Lens not found';
    end if;
    if not (p_aperture = any(v_aperture_stops)) then
      raise exception 'This lens does not support that aperture';
    end if;
    o_aperture := p_aperture;
  else
    o_aperture := null;
  end if;

  if p_lens_id is not null and not exists (
    select 1 from public.lenses where id = p_lens_id and user_id = auth.uid()
  ) then
    raise exception 'Lens not found';
  end if;

  if p_meter_type is not null
     and p_meter_type not in ('In Camera Meter', 'KEKS Meter', 'Meter App', 'No Meter', 'Other') then
    raise exception 'Unrecognized meter type';
  end if;
end;
$$;

grant execute on function public.validate_frame_exposure(uuid, text, numeric, uuid, text) to authenticated;
revoke execute on function public.validate_frame_exposure(uuid, text, numeric, uuid, text) from anon, public;

-- ---------------------------------------------------------------------------
-- 8c. save_frame_and_advance — same signature; camera-aware validation.
-- ---------------------------------------------------------------------------
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
  v_roll       public.rolls;
  v_next_frame integer;
  v_frame      public.frames;
  v_shutter    text;
  v_aperture   numeric;
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

  if v_roll.status <> 'active' then
    raise exception 'This roll is not active';
  end if;

  if p_metadata_logged then
    select o_shutter_speed, o_aperture into v_shutter, v_aperture
    from public.validate_frame_exposure(p_roll_id, p_shutter_speed, p_aperture, p_lens_id, p_meter_type);
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
    case when p_metadata_logged then v_shutter else null end,
    case when p_metadata_logged then v_aperture else null end,
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

-- ---------------------------------------------------------------------------
-- 8d. update_frame — same signature. Logged: camera-aware validation.
--     Unlogged: exposure readings stay null, but lens and location are kept
--     as explicit per-frame overrides (null = inherit from the roll).
-- ---------------------------------------------------------------------------
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
  v_frame    public.frames;
  v_roll_id  uuid;
  v_shutter  text;
  v_aperture numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select roll_id into v_roll_id
  from public.frames where id = p_frame_id and user_id = auth.uid();
  if v_roll_id is null then
    raise exception 'Frame not found';
  end if;

  if p_metadata_logged then
    select o_shutter_speed, o_aperture into v_shutter, v_aperture
    from public.validate_frame_exposure(v_roll_id, p_shutter_speed, p_aperture, p_lens_id, p_meter_type);

    update public.frames
    set metadata_logged = true,
        shutter_speed = v_shutter,
        aperture = v_aperture,
        lens_id = p_lens_id,
        push_pull = coalesce(p_push_pull, 0),
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        meter_type = p_meter_type,
        location_id = p_location_id
    where id = p_frame_id and user_id = auth.uid()
    returning * into v_frame;
  else
    if p_lens_id is not null and not exists (
      select 1 from public.lenses where id = p_lens_id and user_id = auth.uid()
    ) then
      raise exception 'Lens not found';
    end if;

    update public.frames
    set metadata_logged = false,
        shutter_speed = null,
        aperture = null,
        lens_id = p_lens_id,
        push_pull = null,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        meter_type = null,
        location_id = p_location_id
    where id = p_frame_id and user_id = auth.uid()
    returning * into v_frame;
  end if;

  if not found then
    raise exception 'Frame not found';
  end if;

  return v_frame;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. finish_roll(p_roll_id, p_end_date)
-- ---------------------------------------------------------------------------
drop function if exists public.finish_roll(uuid);

create or replace function public.finish_roll(p_roll_id uuid, p_end_date date default null)
returns public.rolls
language plpgsql
security invoker
as $$
declare
  v_roll public.rolls;
  v_end  date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_roll
  from public.rolls
  where id = p_roll_id and user_id = auth.uid()
  for update;

  if not found or v_roll.status <> 'active' then
    raise exception 'Roll not found or already completed';
  end if;

  v_end := coalesce(p_end_date, current_date);
  if v_end < v_roll.start_date then
    raise exception 'The closing date can''t be before the start date';
  end if;

  update public.rolls
  set status = 'completed', end_date = v_end
  where id = p_roll_id
  returning * into v_roll;

  return v_roll;
end;
$$;

grant execute on function public.finish_roll(uuid, date) to authenticated;
revoke execute on function public.finish_roll(uuid, date) from anon, public;

-- ---------------------------------------------------------------------------
-- 10. import_roll_images
--
-- p_files: [{drive_file_id, drive_filename, drive_thumbnail_url,
-- drive_view_url}] already in SmartConvert (natural filename) order.
--
--  * A file already attached to a frame of this roll keeps that frame —
--    number, tags, selection, notes, metadata all untouched; only its
--    filename and short-lived image URLs are refreshed.
--  * A new file becomes a new unlogged frame, numbered after the current
--    last frame, in the given order. On a fresh roll that is 1..N.
--  * A frame whose file is no longer in the folder is left exactly as it is
--    and reported as missing — never deleted, never renumbered.
--  * The roll's status and dates are not changed: finishing is its own step.
--
-- Refuses a roll that has frames without images (a shooting log waiting for
-- its scans): those are matched positionally by apply_roll_sync, and
-- appending here would double the roll.
-- ---------------------------------------------------------------------------
drop function if exists public.import_roll_frames(uuid, text, text, jsonb);

create or replace function public.import_roll_images(
  p_roll_id           uuid,
  p_drive_folder_id   text,
  p_drive_folder_name text,
  p_files             jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_roll        public.rolls;
  v_item        jsonb;
  v_next        integer;
  v_created     integer := 0;
  v_existing    integer := 0;
  v_missing     integer := 0;
  v_file_ids    text[];
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

  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'No images to import';
  end if;

  if v_roll.drive_folder_id is not null and v_roll.drive_folder_id <> p_drive_folder_id
     and exists (select 1 from public.frames where roll_id = p_roll_id and drive_file_id is not null) then
    raise exception 'This roll''s images come from a different Drive folder';
  end if;

  if exists (select 1 from public.frames where roll_id = p_roll_id and drive_file_id is null) then
    raise exception 'This roll has frames without images — use Sync Photos to match them to this folder';
  end if;

  select array_agg(e ->> 'drive_file_id') into v_file_ids
  from jsonb_array_elements(p_files) e;

  if (select count(distinct x) from unnest(v_file_ids) x) <> array_length(v_file_ids, 1) then
    raise exception 'The same image appears twice in the import list';
  end if;

  select coalesce(max(frame_number), 0) into v_next
  from public.frames where roll_id = p_roll_id;

  for v_item in select * from jsonb_array_elements(p_files)
  loop
    update public.frames
    set drive_filename = v_item ->> 'drive_filename',
        drive_thumbnail_url = v_item ->> 'drive_thumbnail_url',
        drive_view_url = v_item ->> 'drive_view_url'
    where roll_id = p_roll_id and drive_file_id = v_item ->> 'drive_file_id';

    if found then
      v_existing := v_existing + 1;
    else
      v_next := v_next + 1;
      v_created := v_created + 1;
      insert into public.frames (
        user_id, roll_id, frame_number, metadata_logged, push_pull,
        drive_file_id, drive_filename, drive_thumbnail_url, drive_view_url, synced_at
      ) values (
        auth.uid(), p_roll_id, v_next, false, null,
        v_item ->> 'drive_file_id',
        v_item ->> 'drive_filename',
        v_item ->> 'drive_thumbnail_url',
        v_item ->> 'drive_view_url',
        now()
      );
    end if;
  end loop;

  select count(*) into v_missing
  from public.frames
  where roll_id = p_roll_id and drive_file_id is not null
    and not (drive_file_id = any(v_file_ids));

  update public.rolls
  set drive_folder_id = p_drive_folder_id,
      drive_folder_name = p_drive_folder_name,
      current_frame = greatest(current_frame, v_next + 1)
  where id = p_roll_id;

  insert into public.roll_sync_history (
    roll_id, drive_folder_id, drive_folder_name, frame_count, image_count, status
  ) values (
    p_roll_id, p_drive_folder_id, p_drive_folder_name,
    v_existing + v_created + v_missing, jsonb_array_length(p_files),
    case when v_missing = 0 then 'completed' else 'completed_with_mismatch' end
  );

  return jsonb_build_object('created', v_created, 'existing', v_existing, 'missing', v_missing);
end;
$$;

grant execute on function public.import_roll_images(uuid, text, text, jsonb) to authenticated;
revoke execute on function public.import_roll_images(uuid, text, text, jsonb) from anon, public;

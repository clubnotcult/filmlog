-- Film Log — Phase 3: create_roll (updated for inventory items), inventory
-- quantity adjustment (renamed to match), and the three functions that drive
-- the Active Roll shooting workflow: save_frame_and_advance, finish_roll,
-- reopen_roll.

-- ---------------------------------------------------------------------------
-- create_roll: now locks + decrements a film_inventory_items row (physical
-- batch) instead of film_stocks directly, since quantity moved there. The
-- roll records both film_stock_id (the type, derived from the chosen item)
-- and film_inventory_item_id (the specific physical item consumed).
-- ---------------------------------------------------------------------------
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
  v_quantity      integer;
  v_film_stock_id uuid;
  v_roll          public.rolls;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select quantity, film_stock_id into v_quantity, v_film_stock_id
  from public.film_inventory_items
  where id = p_film_inventory_item_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Film inventory item not found';
  end if;

  if v_quantity < 1 then
    raise exception 'No units of this film remain in inventory';
  end if;

  if not exists (
    select 1 from public.cameras where id = p_camera_id and user_id = auth.uid()
  ) then
    raise exception 'Camera not found';
  end if;

  if not exists (
    select 1 from public.lenses where id = p_default_lens_id and user_id = auth.uid()
  ) then
    raise exception 'Lens not found';
  end if;

  update public.film_inventory_items
  set quantity = quantity - 1
  where id = p_film_inventory_item_id and user_id = auth.uid();

  insert into public.rolls (
    user_id, film_stock_id, film_inventory_item_id, camera_id, default_lens_id,
    start_date, custom_title, notes
  ) values (
    auth.uid(), v_film_stock_id, p_film_inventory_item_id, p_camera_id, p_default_lens_id,
    p_start_date, nullif(trim(p_custom_title), ''), nullif(trim(p_notes), '')
  )
  returning * into v_roll;

  return v_roll;
end;
$$;

grant execute on function public.create_roll(uuid, uuid, uuid, date, text, text) to authenticated;
revoke execute on function public.create_roll(uuid, uuid, uuid, date, text, text) from anon, public;

-- ---------------------------------------------------------------------------
-- adjust_film_inventory_item_quantity: replaces adjust_film_stock_quantity.
-- Same atomic guarded-UPDATE pattern (the "quantity + delta >= 0" check is
-- part of the same statement, so there's no read-then-write race), now
-- targeting the physical item instead of the type.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_film_inventory_item_quantity(
  p_id    uuid,
  p_delta integer
)
returns public.film_inventory_items
language plpgsql
security invoker
as $$
declare
  v_item public.film_inventory_items;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.film_inventory_items
  set quantity = quantity + p_delta
  where id = p_id and user_id = auth.uid() and quantity + p_delta >= 0
  returning * into v_item;

  if found then
    return v_item;
  end if;

  if exists (
    select 1 from public.film_inventory_items where id = p_id and user_id = auth.uid()
  ) then
    raise exception 'Quantity can''t go below zero';
  else
    raise exception 'Film inventory item not found';
  end if;
end;
$$;

grant execute on function public.adjust_film_inventory_item_quantity(uuid, integer) to authenticated;
revoke execute on function public.adjust_film_inventory_item_quantity(uuid, integer) from anon, public;

-- ---------------------------------------------------------------------------
-- save_frame_and_advance: the core Active Roll operation.
--
-- Locks the roll row for the duration of the call, so two overlapping taps of
-- NEXT FRAME for the same roll (e.g. a double-tap that both reach the server
-- before the client disables the button) serialize instead of racing to
-- compute the same next frame number. The frame number itself is computed
-- from the frames table — max(frame_number)+1 — never from rolls.current_frame,
-- which is just a denormalized cache bumped afterward for fast display
-- elsewhere. The unique(roll_id, frame_number) constraint from Phase 1 is the
-- final backstop against a duplicate even if the locking were ever bypassed.
--
-- Required-field validation (shutter speed, aperture) happens here, not only
-- client-side, so a frame can never be saved without them regardless of what
-- called this function.
-- ---------------------------------------------------------------------------
create or replace function public.save_frame_and_advance(
  p_roll_id       uuid,
  p_shutter_speed text,
  p_aperture      numeric,
  p_lens_id       uuid,
  p_push_pull     numeric default 0,
  p_notes         text default null
)
returns public.frames
language plpgsql
security invoker
as $$
declare
  v_roll       public.rolls;
  v_next_frame integer;
  v_frame      public.frames;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_shutter_speed is null or length(trim(p_shutter_speed)) = 0 then
    raise exception 'Shutter speed is required';
  end if;

  if p_aperture is null then
    raise exception 'Aperture is required';
  end if;

  if p_lens_id is null then
    raise exception 'Lens is required';
  end if;

  -- Lock the roll row for the rest of this transaction.
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

  if not exists (
    select 1 from public.lenses where id = p_lens_id and user_id = auth.uid()
  ) then
    raise exception 'Lens not found';
  end if;

  select coalesce(max(frame_number), 0) + 1 into v_next_frame
  from public.frames
  where roll_id = p_roll_id;

  insert into public.frames (
    user_id, roll_id, frame_number, shutter_speed, aperture, lens_id, push_pull, notes
  ) values (
    auth.uid(), p_roll_id, v_next_frame, p_shutter_speed, p_aperture, p_lens_id,
    coalesce(p_push_pull, 0), nullif(trim(p_notes), '')
  )
  returning * into v_frame;

  update public.rolls
  set current_frame = v_next_frame + 1
  where id = p_roll_id;

  return v_frame;
end;
$$;

grant execute on function public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text) to authenticated;
revoke execute on function public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text) from anon, public;

-- ---------------------------------------------------------------------------
-- finish_roll: the two-step "are you sure" confirmation is a client-side UI
-- concern; this is the single server-side action that actually marks a roll
-- complete. Only affects rolls that are currently 'active', so it can't be
-- called twice by accident.
-- ---------------------------------------------------------------------------
create or replace function public.finish_roll(p_roll_id uuid)
returns public.rolls
language plpgsql
security invoker
as $$
declare
  v_roll public.rolls;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.rolls
  set status = 'completed', end_date = current_date
  where id = p_roll_id and user_id = auth.uid() and status = 'active'
  returning * into v_roll;

  if not found then
    raise exception 'Roll not found or already completed';
  end if;

  return v_roll;
end;
$$;

grant execute on function public.finish_roll(uuid) to authenticated;
revoke execute on function public.finish_roll(uuid) from anon, public;

-- ---------------------------------------------------------------------------
-- reopen_roll: resumes shooting. current_frame is recomputed from the frames
-- table (next unsaved frame number) rather than trusted from whatever it was
-- left at, so it's always correct regardless of history.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_roll(p_roll_id uuid)
returns public.rolls
language plpgsql
security invoker
as $$
declare
  v_roll       public.rolls;
  v_next_frame integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(max(frame_number), 0) + 1 into v_next_frame
  from public.frames
  where roll_id = p_roll_id;

  update public.rolls
  set status = 'active', end_date = null, current_frame = v_next_frame
  where id = p_roll_id and user_id = auth.uid() and status = 'completed'
  returning * into v_roll;

  if not found then
    raise exception 'Roll not found or not completed';
  end if;

  return v_roll;
end;
$$;

grant execute on function public.reopen_roll(uuid) to authenticated;
revoke execute on function public.reopen_roll(uuid) from anon, public;

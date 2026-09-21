-- Film Log — Phase 2: atomic roll creation
--
-- Creating a roll must decrement film stock inventory by exactly one unit, and
-- the two writes (inventory decrement + roll insert) must succeed or fail
-- together (spec: "If creation fails, the inventory transaction should not
-- partially succeed"). A single PL/pgSQL function called over RPC executes as
-- one implicit transaction: any exception rolls back everything it did.
--
-- `for update` locks the film_stocks row for the duration of the function so
-- two concurrent roll-creation requests against the same film stock can't both
-- read quantity=1 and both decrement past zero.

create or replace function public.create_roll(
  p_film_stock_id   uuid,
  p_camera_id       uuid,
  p_default_lens_id uuid,
  p_start_date      date,
  p_custom_title    text default null,
  p_notes           text default null
)
returns public.rolls
language plpgsql
security invoker
as $$
declare
  v_quantity integer;
  v_roll     public.rolls;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the film stock row and confirm it belongs to the caller.
  select quantity into v_quantity
  from public.film_stocks
  where id = p_film_stock_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Film stock not found';
  end if;

  if v_quantity < 1 then
    raise exception 'No units of this film stock remain in inventory';
  end if;

  -- Confirm the camera and lens belong to the caller too, so a roll can never
  -- reference gear it doesn't own.
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

  update public.film_stocks
  set quantity = quantity - 1
  where id = p_film_stock_id and user_id = auth.uid();

  insert into public.rolls (
    user_id, film_stock_id, camera_id, default_lens_id,
    start_date, custom_title, notes
  ) values (
    auth.uid(), p_film_stock_id, p_camera_id, p_default_lens_id,
    p_start_date, nullif(trim(p_custom_title), ''), nullif(trim(p_notes), '')
  )
  returning * into v_roll;

  return v_roll;
end;
$$;

-- RLS on the underlying tables still applies (security invoker runs as the
-- caller), so ownership is enforced twice: once by the function's own checks,
-- once by the table policies. Only signed-in users may call it at all.
grant execute on function public.create_roll(uuid, uuid, uuid, date, text, text) to authenticated;
revoke execute on function public.create_roll(uuid, uuid, uuid, date, text, text) from anon, public;

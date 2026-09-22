-- Film Log — Phase 4: unlogged frames + historical frame editing.
--
-- 1. frames.metadata_logged: explicit "No Input Logged" marker. Defaults to
--    true, so every existing Phase 3 frame — which does have real logged
--    exposure data — is correctly marked as logged with no data change.
-- 2. push_pull becomes nullable: an unlogged frame has genuinely unknown
--    push/pull, not "0" (0 is a real, meaningful value — normal development —
--    and using it as a stand-in for "unknown" would be exactly the kind of
--    fabricated-looking data this feature exists to avoid).
-- 3. A check constraint backstops this at the schema level: an unlogged frame
--    can never carry shutter/aperture/lens/push_pull values, regardless of
--    what inserts or updates it in the future.
-- 4. save_frame_and_advance gains a metadata_logged parameter (defaulting to
--    true, so existing calls are unaffected) and now also validates that the
--    chosen aperture actually belongs to the chosen lens — closing a gap left
--    open in Phase 3, where that was only enforced by the client UI.
-- 5. update_frame: the new function behind historical editing. A frame is a
--    single independent row; updating it can only ever change that one row,
--    so "editing frame 17 never changes frame 18" holds by construction, not
--    by any special-casing here.

alter table public.frames
  add column metadata_logged boolean not null default true;

alter table public.frames
  alter column push_pull drop not null;

alter table public.frames
  add constraint frames_unlogged_has_no_exposure_data check (
    metadata_logged = true
    or (shutter_speed is null and aperture is null and lens_id is null and push_pull is null)
  );

create index idx_frames_push_pull      on public.frames (push_pull);
create index idx_frames_metadata_logged on public.frames (metadata_logged);

-- ---------------------------------------------------------------------------
-- save_frame_and_advance: add metadata_logged; validate aperture-against-lens
-- for logged frames; force every exposure field to null for unlogged ones
-- regardless of what the caller passed, so "unlogged but has fake numbers"
-- can never happen even from a buggy or malicious caller.
-- ---------------------------------------------------------------------------
drop function if exists public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text);

create or replace function public.save_frame_and_advance(
  p_roll_id         uuid,
  p_shutter_speed   text,
  p_aperture        numeric,
  p_lens_id         uuid,
  p_push_pull       numeric default 0,
  p_notes           text default null,
  p_metadata_logged boolean default true
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

  select coalesce(max(frame_number), 0) + 1 into v_next_frame
  from public.frames
  where roll_id = p_roll_id;

  insert into public.frames (
    user_id, roll_id, frame_number, shutter_speed, aperture, lens_id, push_pull, notes, metadata_logged
  ) values (
    auth.uid(),
    p_roll_id,
    v_next_frame,
    case when p_metadata_logged then p_shutter_speed else null end,
    case when p_metadata_logged then p_aperture else null end,
    case when p_metadata_logged then p_lens_id else null end,
    case when p_metadata_logged then coalesce(p_push_pull, 0) else null end,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_metadata_logged
  )
  returning * into v_frame;

  update public.rolls
  set current_frame = v_next_frame + 1
  where id = p_roll_id;

  return v_frame;
end;
$$;

grant execute on function public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text, boolean) to authenticated;
revoke execute on function public.save_frame_and_advance(uuid, text, numeric, uuid, numeric, text, boolean) from anon, public;

-- ---------------------------------------------------------------------------
-- update_frame: historical editing. frame_number and roll_id are never
-- touched here (not accepted as parameters at all), so a frame's identity and
-- position are immutable — only its exposure/notes/logged-status can change.
-- Same aperture-belongs-to-lens validation as creation, for logged frames.
-- ---------------------------------------------------------------------------
create or replace function public.update_frame(
  p_frame_id        uuid,
  p_metadata_logged boolean,
  p_shutter_speed   text default null,
  p_aperture        numeric default null,
  p_lens_id         uuid default null,
  p_push_pull       numeric default null,
  p_notes           text default null
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

    update public.frames
    set metadata_logged = true,
        shutter_speed = p_shutter_speed,
        aperture = p_aperture,
        lens_id = p_lens_id,
        push_pull = coalesce(p_push_pull, 0),
        notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = p_frame_id and user_id = auth.uid()
    returning * into v_frame;
  else
    update public.frames
    set metadata_logged = false,
        shutter_speed = null,
        aperture = null,
        lens_id = null,
        push_pull = null,
        notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = p_frame_id and user_id = auth.uid()
    returning * into v_frame;
  end if;

  if not found then
    raise exception 'Frame not found';
  end if;

  return v_frame;
end;
$$;

grant execute on function public.update_frame(uuid, boolean, text, numeric, uuid, numeric, text) to authenticated;
revoke execute on function public.update_frame(uuid, boolean, text, numeric, uuid, numeric, text) from anon, public;

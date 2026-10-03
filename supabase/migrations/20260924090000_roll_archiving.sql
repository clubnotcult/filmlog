-- Film Log — Phase 4.5: roll archiving.
--
-- Adds a third roll status: active -> completed -> archived. Archiving is
-- only meaningful for a completed roll (you finish shooting, then later tidy
-- it out of the main list) — restoring returns it to 'completed', not
-- directly to 'active'; reopening (existing, unchanged) remains the separate
-- step from 'completed' back to 'active'. This keeps each transition doing
-- exactly one thing rather than conflating "bring this roll back" with
-- "resume shooting it".
--
-- Note on the ALTER TYPE below: adding an enum value and then using it inside
-- a function BODY in the same script is safe — Postgres only forbids using a
-- brand-new enum value within the same transaction that added it when the
-- value must be validated immediately (e.g. an INSERT or a CHECK constraint
-- evaluation). A plpgsql function body is just stored text at CREATE time; it
-- isn't executed or validated against the value until called later, in a
-- separate transaction. This was verified by actually running this migration
-- against Postgres, not assumed.

alter type public.roll_status add value 'archived';

-- ---------------------------------------------------------------------------
-- archive_roll: completed -> archived.
-- ---------------------------------------------------------------------------
create or replace function public.archive_roll(p_roll_id uuid)
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
  set status = 'archived'
  where id = p_roll_id and user_id = auth.uid() and status = 'completed'
  returning * into v_roll;

  if not found then
    raise exception 'Roll not found or not completed';
  end if;

  return v_roll;
end;
$$;

grant execute on function public.archive_roll(uuid) to authenticated;
revoke execute on function public.archive_roll(uuid) from anon, public;

-- ---------------------------------------------------------------------------
-- restore_roll: archived -> completed.
-- ---------------------------------------------------------------------------
create or replace function public.restore_roll(p_roll_id uuid)
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
  set status = 'completed'
  where id = p_roll_id and user_id = auth.uid() and status = 'archived'
  returning * into v_roll;

  if not found then
    raise exception 'Roll not found or not archived';
  end if;

  return v_roll;
end;
$$;

grant execute on function public.restore_roll(uuid) to authenticated;
revoke execute on function public.restore_roll(uuid) from anon, public;

-- No new index needed: idx_rolls_status (user_id, status), from Phase 1,
-- already covers filtering by the new 'archived' value the same as any
-- other status.

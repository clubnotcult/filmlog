-- Film Log — frame insertion.
--
-- Architecture: inserting a frame means shifting frame_number up by one for
-- every frame after the insertion point, done as a single UPDATE against the
-- EXISTING rows (never delete+recreate). Because it's an update on the same
-- rows, every id-keyed association — favorites, tags (frame_tags.frame_id),
-- exposure evaluation, notes, Drive image associations — is preserved
-- automatically, with no extra bookkeeping and no risk of an orphaned
-- record. This is the opposite tradeoff from Phase 9's frame deletion, which
-- deliberately leaves a gap rather than renumber: there, renumbering would
-- have silently changed what an untouched frame's number meant. Here,
-- renumbering IS the fix — the whole point of inserting a frame is that the
-- existing numbers are wrong (a shot was missed) and need to shift to match
-- reality.
--
-- Shifting N rows to N+1 in one UPDATE will transiently violate the existing
-- UNIQUE(roll_id, frame_number) constraint — row 5 becomes 6 while row 6
-- still exists, etc — even though the final state has no duplicates.
-- Postgres's standard answer is a deferrable constraint: checked at
-- transaction commit instead of after each row, so the transient collision
-- during the update is invisible and the real, final state is still fully
-- enforced.
alter table public.frames
  drop constraint frames_unique_number_per_roll,
  add constraint frames_unique_number_per_roll
    unique (roll_id, frame_number) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- insert_frame: shifts every frame after p_after_frame_number up by one,
-- then inserts a new, unlogged frame at p_after_frame_number + 1.
--
-- "Insert after frame N" -> p_after_frame_number = N.
-- "Insert before frame N" -> p_after_frame_number = N - 1 (so N itself is
-- one of the frames that shifts, becoming N + 1, and the new frame takes its
-- old position). Inserting before frame 1 is p_after_frame_number = 0.
--
-- The new frame is created unlogged (metadata_logged = false) and with no
-- Drive association — a frame that was missed while shooting has no image
-- of its own recorded here yet, and inventing exposure data for it would be
-- exactly what the app's "Unknown, never invented" principle exists to
-- prevent. It also does not touch the Drive associations of the frames it
-- shifts: those frames keep whatever image they were last synced to until
-- the roll is re-synced, at which point natural filename order will
-- correctly realign every (now-correct) frame_number with its real photo —
-- re-syncing after an insertion is expected, not automatic, since this
-- function has no Drive access of its own to do it immediately.
-- ---------------------------------------------------------------------------
create or replace function public.insert_frame(
  p_roll_id uuid,
  p_after_frame_number integer
)
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

  if p_after_frame_number < 0 then
    raise exception 'Invalid insertion point';
  end if;

  select * into v_roll
  from public.rolls
  where id = p_roll_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Roll not found';
  end if;

  -- Lock the frames we're about to renumber so a concurrent insert on the
  -- same roll can't interleave with this one.
  perform 1
  from public.frames
  where roll_id = p_roll_id and user_id = auth.uid()
  for update;

  update public.frames
  set frame_number = frame_number + 1
  where roll_id = p_roll_id
    and user_id = auth.uid()
    and frame_number > p_after_frame_number;

  insert into public.frames (
    user_id, roll_id, frame_number, metadata_logged, push_pull
  ) values (
    auth.uid(), p_roll_id, p_after_frame_number + 1, false, null
  )
  returning * into v_frame;

  update public.rolls
  set current_frame = current_frame + 1
  where id = p_roll_id;

  return v_frame;
end;
$$;

grant execute on function public.insert_frame(uuid, integer) to authenticated;
revoke execute on function public.insert_frame(uuid, integer) from anon, public;

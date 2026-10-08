-- Film Log — roll import.
--
-- For a roll shot entirely outside the app: the roll itself is still
-- created through the existing create_roll RPC unchanged (same film stock /
-- camera / lens / inventory-decrement behavior as any other roll — gear is
-- still asked for even though per-frame exposure will be unknown, since gear
-- is a roll-level fact the person usually does know). This function is the
-- second step: given a Drive folder's files in natural order, it creates one
-- unlogged frame per file, in that order, all in a single transaction.
--
-- Only usable once, on a roll with zero existing frames — this is bulk
-- CREATION, not a sync/replace like apply_roll_sync (which requires the
-- frames to already exist). Guarding on "no frames yet" is what keeps this
-- from being callable twice and silently doubling a roll's frames.
create or replace function public.import_roll_frames(
  p_roll_id           uuid,
  p_drive_folder_id   text,
  p_drive_folder_name text,
  -- Array of {drive_file_id, drive_filename, drive_thumbnail_url, drive_view_url}, in the order frame numbers should be assigned.
  p_files             jsonb
)
returns setof public.frames
language plpgsql
security invoker
as $$
declare
  v_roll          public.rolls;
  v_existing_count integer;
  v_item          jsonb;
  v_frame_number  integer := 0;
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
    raise exception 'This roll has already been imported or is not eligible for import';
  end if;

  select count(*) into v_existing_count from public.frames where roll_id = p_roll_id;
  if v_existing_count > 0 then
    raise exception 'This roll already has frames — import only applies to a roll with none';
  end if;

  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'No images to import';
  end if;

  for v_item in select * from jsonb_array_elements(p_files)
  loop
    v_frame_number := v_frame_number + 1;
    insert into public.frames (
      user_id, roll_id, frame_number, metadata_logged, push_pull,
      drive_file_id, drive_filename, drive_thumbnail_url, drive_view_url, synced_at
    ) values (
      auth.uid(),
      p_roll_id,
      v_frame_number,
      false,
      null,
      v_item ->> 'drive_file_id',
      v_item ->> 'drive_filename',
      v_item ->> 'drive_thumbnail_url',
      v_item ->> 'drive_view_url',
      now()
    );
  end loop;

  -- An imported roll represents film that's already been shot and scanned —
  -- there's no further shooting to do through Active Roll, so it lands
  -- directly in "completed" rather than "active". end_date defaults to
  -- start_date only if genuinely unset; the real shoot date range is
  -- unknown, and this is the least presumptive placeholder.
  update public.rolls
  set drive_folder_id = p_drive_folder_id,
      drive_folder_name = p_drive_folder_name,
      current_frame = v_frame_number + 1,
      status = 'completed',
      end_date = coalesce(end_date, start_date)
  where id = p_roll_id;

  insert into public.roll_sync_history (
    roll_id, drive_folder_id, drive_folder_name, frame_count, image_count, status
  ) values (
    p_roll_id, p_drive_folder_id, p_drive_folder_name, v_frame_number, v_frame_number, 'completed'
  );

  return query
    select * from public.frames where roll_id = p_roll_id order by frame_number;
end;
$$;

grant execute on function public.import_roll_frames(uuid, text, text, jsonb) to authenticated;
revoke execute on function public.import_roll_frames(uuid, text, text, jsonb) from anon, public;

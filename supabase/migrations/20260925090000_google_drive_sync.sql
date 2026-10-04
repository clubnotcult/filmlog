-- Film Log — Phase 5: Google Drive photo sync.
--
-- Images stay in Google Drive; this only adds columns to reference them and a
-- small table to track sync events. No image binaries are ever stored here.
--
-- frames.drive_file_id / drive_filename already existed (Phase 1, unused
-- until now). This adds the remaining reference fields Drive's API actually
-- returns, plus synced_at so "has this frame's image been attached, and
-- when" is a plain column check, not something derived.

alter table public.frames
  add column drive_thumbnail_url text,
  add column drive_view_url     text,
  add column synced_at          timestamptz;

alter table public.rolls
  add column drive_folder_name text;

-- A Drive file should never be attached to more than one frame within the
-- same roll — this is the schema-level backstop for "frame-image mappings
-- remain unique," independent of whatever the sync logic does.
create unique index idx_frames_roll_drive_file_unique
  on public.frames (roll_id, drive_file_id)
  where drive_file_id is not null;

-- ---------------------------------------------------------------------------
-- roll_sync_history: lightweight traceability, not an elaborate model.
-- status is a plain checked string rather than an enum — cheap to extend
-- later (e.g. a 'failed' status from a future retry mechanism) without the
-- ALTER TYPE ceremony a real enum would need.
-- ---------------------------------------------------------------------------
create table public.roll_sync_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  roll_id            uuid not null references public.rolls (id) on delete cascade,
  drive_folder_id    text not null,
  drive_folder_name  text,
  frame_count        integer not null,
  image_count        integer not null,
  status             text not null check (status in ('completed', 'completed_with_mismatch')),
  synced_at          timestamptz not null default now()
);

create index idx_roll_sync_history_user on public.roll_sync_history (user_id);
create index idx_roll_sync_history_roll on public.roll_sync_history (roll_id, synced_at desc);

alter table public.roll_sync_history enable row level security;

create policy "roll_sync_history_select_own" on public.roll_sync_history
  for select to authenticated using (auth.uid() = user_id);
create policy "roll_sync_history_insert_own" on public.roll_sync_history
  for insert to authenticated with check (auth.uid() = user_id);
-- No update/delete policies: sync history is an append-only log. Deleting the
-- roll cascades it away (ON DELETE CASCADE above); nothing else should
-- rewrite it.

-- ---------------------------------------------------------------------------
-- apply_roll_sync: the one place a sync (or re-sync) is actually written.
--
-- A re-sync is a full, authoritative replace: every one of this roll's
-- frames first has its image fields cleared, then the new mapping is applied
-- on top. This is what makes re-sync safe — there's no way for a stale
-- mapping from a previous sync to survive alongside a new one, and no way to
-- create a second image reference for a frame (each mapping entry updates an
-- existing frame row by its own id; nothing here ever inserts a frame row).
--
-- p_mappings is a JSON array of
--   {frame_id, drive_file_id, drive_filename, drive_thumbnail_url, drive_view_url}
-- built client-side from the resolved frame<->file ordering (see
-- src/lib/google-drive). Passing it as one JSON value, rather than one RPC
-- call per frame, keeps the whole sync atomic — either every frame in the
-- mapping updates and the history row is written, or none of it is.
-- ---------------------------------------------------------------------------
create or replace function public.apply_roll_sync(
  p_roll_id           uuid,
  p_drive_folder_id   text,
  p_drive_folder_name text,
  p_mappings          jsonb,
  p_frame_count       integer,
  p_image_count       integer,
  p_status            text
)
returns public.roll_sync_history
language plpgsql
security invoker
as $$
declare
  v_history public.roll_sync_history;
  v_mapping jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.rolls where id = p_roll_id and user_id = auth.uid()
  ) then
    raise exception 'Roll not found';
  end if;

  if p_status not in ('completed', 'completed_with_mismatch') then
    raise exception 'Invalid sync status';
  end if;

  if jsonb_typeof(p_mappings) <> 'array' then
    raise exception 'Mappings must be a JSON array';
  end if;

  -- Full replace: clear this roll's existing image references first.
  update public.frames
  set drive_file_id = null,
      drive_filename = null,
      drive_thumbnail_url = null,
      drive_view_url = null,
      synced_at = null
  where roll_id = p_roll_id and user_id = auth.uid();

  for v_mapping in select * from jsonb_array_elements(p_mappings)
  loop
    update public.frames
    set drive_file_id = v_mapping->>'drive_file_id',
        drive_filename = v_mapping->>'drive_filename',
        drive_thumbnail_url = v_mapping->>'drive_thumbnail_url',
        drive_view_url = v_mapping->>'drive_view_url',
        synced_at = now()
    where id = (v_mapping->>'frame_id')::uuid
      and roll_id = p_roll_id
      and user_id = auth.uid();

    if not found then
      raise exception 'Frame % not found on this roll', (v_mapping->>'frame_id');
    end if;
  end loop;

  update public.rolls
  set drive_folder_id = p_drive_folder_id,
      drive_folder_name = p_drive_folder_name
  where id = p_roll_id and user_id = auth.uid();

  insert into public.roll_sync_history (
    roll_id, drive_folder_id, drive_folder_name, frame_count, image_count, status
  ) values (
    p_roll_id, p_drive_folder_id, p_drive_folder_name, p_frame_count, p_image_count, p_status
  )
  returning * into v_history;

  return v_history;
end;
$$;

grant execute on function public.apply_roll_sync(uuid, text, text, jsonb, integer, integer, text) to authenticated;
revoke execute on function public.apply_roll_sync(uuid, text, text, jsonb, integer, integer, text) from anon, public;

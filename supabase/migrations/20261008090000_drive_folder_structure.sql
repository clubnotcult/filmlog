-- Film Log — Google Drive archive folders.
--
-- A completed roll can get a folder in the person's Drive archive:
--   <archive root> / <year> / <roll title> / { RAW, JPEG, SELECTS }
--
-- Four IDs are stored on the roll. They are deliberately SEPARATE from the
-- existing rolls.drive_folder_id, which keeps its meaning: "the folder whose
-- direct children are the synced JPEGs". Everything that syncs or refreshes
-- images keeps reading drive_folder_id unchanged, so no existing roll — and no
-- existing sync code — is affected by this migration.
--
--   drive_parent_folder_id   the roll's own folder (the archive identifier)
--   drive_jpeg_folder_id     its image folder: 'JPEG' for new rolls, or the
--                            person's existing 'JPG' folder when a roll that
--                            was already synced is adopted
--   drive_raw_folder_id      organizational only — never read or processed
--   drive_selects_folder_id  organizational only — not tied to hearts/stars
--
-- All nullable: an existing roll simply has none of them. The columns are only
-- ever written together (see the check constraint), so a roll can never end up
-- holding a half-built association.

alter table public.rolls
  add column drive_parent_folder_id  text,
  add column drive_jpeg_folder_id    text,
  add column drive_raw_folder_id     text,
  add column drive_selects_folder_id text,
  add constraint rolls_drive_structure_all_or_none check (
    (drive_parent_folder_id is null and drive_jpeg_folder_id is null
       and drive_raw_folder_id is null and drive_selects_folder_id is null)
    or
    (drive_parent_folder_id is not null and drive_jpeg_folder_id is not null
       and drive_raw_folder_id is not null and drive_selects_folder_id is not null)
  );

-- Per-person settings. Today it holds one thing — where the Drive archive
-- lives — but it is a general home for future preferences (export destinations
-- and the like) so they don't each need a table. One row per user.
create table public.user_settings (
  user_id                  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  drive_archive_root_id    text,
  drive_archive_root_name  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_settings_delete_own" on public.user_settings
  for delete to authenticated using (auth.uid() = user_id);

create trigger set_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.user_settings to authenticated;

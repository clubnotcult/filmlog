-- Film Log — Phase 6C: Explore.
--
-- Explore's queries are pure reads (no new RPC needed — every filter maps to
-- ordinary .eq()/.in()/.gte()/.lte() calls the Supabase client already
-- supports, protected by the existing RLS policies). Reviewing the actual
-- query patterns against the indexes already in place (Phase 1 and later):
-- aperture, shutter_speed, push_pull, lens_id, and roll_id are all indexed on
-- frames; film_stock_id, camera_id, and start_date are all indexed on rolls.
-- That covers every combinable filter Explore offers except one gap: with NO
-- filter active, Explore's default view is "every synced frame, newest
-- first" — a query with no other index to lean on. This adds exactly that,
-- and nothing else; the rest of the coverage already exists.

create index idx_frames_user_synced_created
  on public.frames (user_id, created_at desc)
  where drive_file_id is not null;

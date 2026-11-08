-- Image-first archive: behaviour tests against real Postgres.
--
-- Run order (fresh database):
--   00_fake_auth.sql, every migration BEFORE 20261108090000, this file.
-- This file seeds "legacy" data first, then applies the image-first
-- migration itself, so it proves existing rows survive the upgrade.
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f 05_image_first_archive_tests.sql
-- Any failed assertion raises and stops the script; the last line printed on
-- success is "ALL IMAGE-FIRST TESTS PASSED".

\set ON_ERROR_STOP on
\pset pager off

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- ---------------------------------------------------------------------------
-- Legacy data, created through the OLD functions.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into public.cameras (name, shutter_speeds) values ('Canon New F-1', array['1/60','1/125','1/250']);
insert into public.lenses (name, focal_length, aperture_stops) values
  ('FD 50mm f/1.4', '50mm', array[1.4,2,2.8,4,5.6,8]),
  ('FD 28mm f/2.8', '28mm', array[2.8,4,5.6,8]);
insert into public.film_stocks (name, iso, format, film_type) values ('Portra 400', 400, '35mm', 'color_negative');
insert into public.film_inventory_items (film_stock_id, quantity) select id, 3 from public.film_stocks;
select public.create_roll(
  (select id from public.film_inventory_items limit 1),
  (select id from public.cameras limit 1),
  (select id from public.lenses where name = 'FD 50mm f/1.4'),
  '2026-09-10', 'Legacy', null);
select public.save_frame_and_advance(
  (select id from public.rolls limit 1), '1/125', 8, (select id from public.lenses where name = 'FD 50mm f/1.4'));
update public.frames set selection = 'star', exposure_evaluation = 'Correct';
commit;

\echo '--- applying image-first migration over legacy data ---'
\ir ../../supabase/migrations/20261108090000_image_first_archive.sql

-- Helpers ------------------------------------------------------------------
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

\echo '--- [legacy] existing rows intact ---'
select pg_temp.check((select count(*) from public.rolls) = 1, 'legacy roll preserved');
select pg_temp.check((select default_lens_id is not null and film_inventory_item_id is not null from public.rolls), 'legacy roll keeps lens + inventory refs');
select pg_temp.check((select shutter_speed = '1/125' and aperture = 8 and selection = 'star' and exposure_evaluation = 'Correct' from public.frames), 'legacy frame exposure + selection + evaluation intact');
select pg_temp.check((select exposure_control from public.cameras) = 'manual', 'existing cameras default to manual');
select pg_temp.check((select quantity from public.film_inventory_items) = 2, 'inventory unchanged by migration');

-- Fixture ids
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into public.cameras (name, exposure_control) values ('Olympus AF-1', 'automatic');
insert into public.film_stocks (name, iso, format, film_type, card_design)
values ('Tri-X 400', 400, '35mm', 'bw_negative',
        '{"version":1,"colors":["#f2c94c","#1a1a1a"],"layout":"rows","direction":"horizontal","text":"TRI-X","textPosition":"bottom","textTone":"auto"}');
commit;

\echo '--- [1] create a roll with only camera + film (no lens, no inventory) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.create_roll(
  p_film_stock_id => (select id from public.film_stocks where name = 'Portra 400'),
  p_camera_id     => (select id from public.cameras where name = 'Canon New F-1'),
  p_start_date    => '2026-11-01',
  p_custom_title  => 'Import roll');
commit;
select pg_temp.check((select default_lens_id is null and film_inventory_item_id is null and status = 'active'
                      from public.rolls where custom_title = 'Import roll'), 'roll created without lens or inventory, active');
select pg_temp.check((select quantity from public.film_inventory_items) = 2, 'no inventory consumed when none chosen');

\echo '--- [2] compact camera roll with global tags + location + inventory ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.get_or_create_location('Panama City');
select public.create_roll(
  p_film_stock_id          => (select id from public.film_stocks where name = 'Portra 400'),
  p_camera_id              => (select id from public.cameras where name = 'Olympus AF-1'),
  p_start_date             => '2026-11-02',
  p_film_inventory_item_id => (select id from public.film_inventory_items limit 1),
  p_custom_title           => 'Compact',
  p_location_id            => (select id from public.locations where name = 'Panama City'),
  p_tag_names              => array['Panama', 'WBC', 'travel', 'panama']);
commit;
select pg_temp.check((select quantity from public.film_inventory_items) = 1, 'inventory consumed when item chosen');
select pg_temp.check((select count(*) from public.roll_tags rt join public.rolls r on r.id = rt.roll_id where r.custom_title = 'Compact') = 3, 'global tags stored once each (case-insensitive)');
select pg_temp.check((select location_id is not null from public.rolls where custom_title = 'Compact'), 'roll location stored');

\echo '--- [3] wrong-stock inventory item is refused ---'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  begin
    perform public.create_roll(
      p_film_stock_id => (select id from public.film_stocks where name = 'Tri-X 400'),
      p_camera_id => (select id from public.cameras limit 1), p_start_date => '2026-11-02',
      p_film_inventory_item_id => (select id from public.film_inventory_items limit 1));
    raise exception 'should have failed';
  exception when raise_exception then
    if sqlerrm not like '%different film stock%' then raise; end if;
  end;
end $$;
select pg_temp.check(true, 'mismatched inventory item rejected');

\echo '--- [4] import 3 images into the import roll: frames 1..3 in given order ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.import_roll_images(
  (select id from public.rolls where custom_title = 'Import roll'), 'folderA', 'JPEG',
  '[{"drive_file_id":"f9","drive_filename":"000009.jpg"},
    {"drive_file_id":"f10","drive_filename":"000010.jpg"},
    {"drive_file_id":"f11","drive_filename":"000011.jpg"}]');
commit;
select pg_temp.check((select string_agg(frame_number || ':' || drive_file_id, ',' order by frame_number)
                      from public.frames f join public.rolls r on r.id = f.roll_id where r.custom_title = 'Import roll')
                     = '1:f9,2:f10,3:f11', 'one frame per image, sequential from 1, correct file ids');
select pg_temp.check((select bool_and(not metadata_logged and shutter_speed is null and aperture is null and lens_id is null and meter_type is null)
                      from public.frames f join public.rolls r on r.id = f.roll_id where r.custom_title = 'Import roll'),
                     'imported frames carry no invented exposure data');
select pg_temp.check((select status = 'active' and end_date is null from public.rolls where custom_title = 'Import roll'),
                     'import does not finish the roll');

\echo '--- [5] curate, then re-import the same folder plus a new image ---'
update public.frames set selection = 'heart', notes = 'keep'
where drive_file_id = 'f10';
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select pg_temp.check(
  public.import_roll_images(
    (select id from public.rolls where custom_title = 'Import roll'), 'folderA', 'JPEG',
    '[{"drive_file_id":"f9","drive_filename":"000009.jpg"},
      {"drive_file_id":"f10","drive_filename":"000010.jpg","drive_thumbnail_url":"fresh"},
      {"drive_file_id":"f11","drive_filename":"000011.jpg"},
      {"drive_file_id":"f12","drive_filename":"000012.jpg"}]')
  = '{"created":1,"existing":3,"missing":0}'::jsonb, 'refresh reports 1 new, 3 existing');
commit;
select pg_temp.check((select count(*) from public.frames f join public.rolls r on r.id = f.roll_id where r.custom_title = 'Import roll') = 4, 'no duplicates after re-import');
select pg_temp.check((select frame_number = 2 and selection = 'heart' and notes = 'keep' and drive_thumbnail_url = 'fresh'
                      from public.frames where drive_file_id = 'f10'), 'existing association, selection and notes preserved; URL refreshed');
select pg_temp.check((select frame_number from public.frames where drive_file_id = 'f12') = 4, 'new image appended as frame 4');

\echo '--- [6] a file removed from Drive is reported, never deleted ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select pg_temp.check(
  (public.import_roll_images(
    (select id from public.rolls where custom_title = 'Import roll'), 'folderA', 'JPEG',
    '[{"drive_file_id":"f9","drive_filename":"000009.jpg"},{"drive_file_id":"f10","drive_filename":"000010.jpg"},{"drive_file_id":"f12","drive_filename":"000012.jpg"}]')
   ->> 'missing')::int = 1, 'missing file counted');
commit;
select pg_temp.check((select count(*) from public.frames where drive_file_id = 'f11') = 1, 'frame for missing file kept');

\echo '--- [7] import refuses a shooting-log roll with image-less frames ---'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  begin
    perform public.import_roll_images((select id from public.rolls where custom_title = 'Legacy'), 'x', 'JPEG', '[{"drive_file_id":"z"}]');
    raise exception 'should have failed';
  exception when raise_exception then
    if sqlerrm not like '%Sync Photos%' then raise; end if;
  end;
end $$;
select pg_temp.check(true, 'shooting-log roll routed to Sync Photos');

\echo '--- [8] frame lens override on an unlogged frame; changing roll default keeps it ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.update_frame(
  (select id from public.frames where drive_file_id = 'f12'), false,
  p_lens_id => (select id from public.lenses where name = 'FD 28mm f/2.8'));
update public.rolls set default_lens_id = (select id from public.lenses where name = 'FD 50mm f/1.4') where custom_title = 'Import roll';
commit;
select pg_temp.check((select l.name from public.frames f join public.lenses l on l.id = f.lens_id where f.drive_file_id = 'f12') = 'FD 28mm f/2.8', 'explicit frame lens kept after roll default change');
select pg_temp.check((select count(*) from public.frames where drive_file_id in ('f9','f10') and lens_id is not null) = 0, 'other frames still inherit (no lens copied onto them)');

\echo '--- [9] compact camera: logged frame needs no shutter/aperture, and gets none ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance((select id from public.rolls where custom_title = 'Compact'), null, null, null);
select public.save_frame_and_advance((select id from public.rolls where custom_title = 'Compact'), '1/125', 8, null);
commit;
select pg_temp.check((select bool_and(metadata_logged and shutter_speed is null and aperture is null)
                      from public.frames f join public.rolls r on r.id = f.roll_id where r.custom_title = 'Compact'),
                     'automatic camera: N/A settings stored as null even if sent');

\echo '--- [10] manual camera still requires shutter + aperture + lens ---'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  begin
    perform public.save_frame_and_advance((select id from public.rolls where custom_title = 'Legacy'), null, 8, null);
    raise exception 'should have failed';
  exception when raise_exception then
    if sqlerrm not like '%Shutter speed is required%' then raise; end if;
  end;
end $$;
select pg_temp.check(true, 'manual camera validation preserved');

\echo '--- [11] finish with the person''s local date, then reopen ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.finish_roll((select id from public.rolls where custom_title = 'Import roll'), '2026-11-07');
commit;
select pg_temp.check((select status = 'completed' and end_date = '2026-11-07' from public.rolls where custom_title = 'Import roll'),
                     'finished with exact closing date');
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  begin
    perform public.finish_roll((select id from public.rolls where custom_title = 'Compact'), '2026-01-01');
    raise exception 'should have failed';
  exception when raise_exception then
    if sqlerrm not like '%before the start date%' then raise; end if;
  end;
end $$;
select pg_temp.check(true, 'closing date before start rejected');
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.reopen_roll((select id from public.rolls where custom_title = 'Import roll'));
commit;
select pg_temp.check((select status = 'active' and end_date is null from public.rolls where custom_title = 'Import roll'), 'completed roll reopens');
select pg_temp.check((select count(*) from public.frames f join public.rolls r on r.id = f.roll_id where r.custom_title = 'Import roll') = 4, 'reopening keeps frames');

\echo '--- [12] removing a roll tag leaves an independent frame copy alone ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into public.frame_tags (frame_id, tag_id)
select f.id, t.id from public.frames f, public.tags t
where f.roll_id = (select id from public.rolls where custom_title = 'Compact') and t.name = 'Panama'
limit 1;
delete from public.roll_tags
where roll_id = (select id from public.rolls where custom_title = 'Compact')
  and tag_id = (select id from public.tags where name = 'Panama');
commit;
select pg_temp.check((select count(*) from public.frame_tags ft join public.tags t on t.id = ft.tag_id where t.name = 'Panama') = 1,
                     'frame-level copy of a removed roll tag survives');

\echo '--- [13] RLS: user B sees no roll tags and cannot import into A''s roll ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select pg_temp.check((select count(*) from public.roll_tags) = 0, 'roll_tags isolated by RLS');
commit;
do $$ declare v_roll uuid; begin
  select id into v_roll from public.rolls where custom_title = 'Import roll';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
  begin
    perform public.import_roll_images(v_roll, 'folderA', 'JPEG', '[{"drive_file_id":"evil"}]');
    raise exception 'should have failed';
  exception when raise_exception then
    if sqlerrm not like '%Roll not found%' then raise; end if;
  end;
end $$;
select pg_temp.check(true, 'cross-user import refused');

\echo '--- [14] card design stored as structured json; non-object rejected ---'
select pg_temp.check((select card_design ->> 'layout' from public.film_stocks where name = 'Tri-X 400') = 'rows', 'card design round-trips');
do $$ begin
  begin
    update public.film_stocks set card_design = '"red"' where name = 'Tri-X 400';
    raise exception 'should have failed';
  exception when check_violation then null;
  end;
end $$;
select pg_temp.check(true, 'non-object card design rejected');

\echo 'ALL IMAGE-FIRST TESTS PASSED'

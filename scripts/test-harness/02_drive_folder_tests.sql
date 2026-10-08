-- Drive folder structure migration (20261008090000): columns, all-or-none
-- constraint, backward compatibility with already-synced rolls, user_settings
-- RLS. Runs after 00_fake_auth.sql and the full migration chain.
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com');

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
insert into public.cameras (name, format, shutter_speeds) values ('Canon A-1','35mm',array['1/60','1/125']);
insert into public.lenses (name, focal_length, aperture_stops) values ('FD 50','50mm',array[1.8,2.8]);
insert into public.film_stocks (name, iso, format) values ('Portra 400',400,'35mm');
insert into public.film_inventory_items (film_stock_id, quantity)
  select id, 3 from public.film_stocks;
select public.create_roll((select id from public.film_inventory_items limit 1),(select id from public.cameras limit 1),(select id from public.lenses limit 1),'2026-09-10') as id \gset r1_
select public.create_roll((select id from public.film_inventory_items limit 1),(select id from public.cameras limit 1),(select id from public.lenses limit 1),'2026-09-11') as id \gset r2_
commit;

\echo '--- [1] existing-style synced roll (drive_folder_id only) is untouched: all new columns null ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
update public.rolls set drive_folder_id='LEGACYJPG', drive_folder_name='JPG' where start_date='2026-09-10';
select drive_folder_id, drive_parent_folder_id, drive_jpeg_folder_id, drive_raw_folder_id, drive_selects_folder_id from public.rolls where start_date='2026-09-10';
commit;

\echo '--- [2] partial association is rejected (expect check violation) ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
update public.rolls set drive_parent_folder_id='P', drive_jpeg_folder_id='J' where start_date='2026-09-11';
rollback;

\echo '--- [3] full association is accepted; drive_folder_id (sync) is independent ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
update public.rolls set drive_parent_folder_id='P', drive_jpeg_folder_id='J', drive_raw_folder_id='R', drive_selects_folder_id='S' where start_date='2026-09-11';
select drive_folder_id is null as sync_untouched, drive_parent_folder_id, drive_jpeg_folder_id, drive_raw_folder_id, drive_selects_folder_id from public.rolls where start_date='2026-09-11';
commit;

\echo '--- [4] adopting a legacy roll: association points at the existing JPG folder ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
update public.rolls set drive_parent_folder_id='P0', drive_jpeg_folder_id='LEGACYJPG', drive_raw_folder_id='R0', drive_selects_folder_id='S0' where start_date='2026-09-10';
select drive_folder_id = drive_jpeg_folder_id as sync_folder_is_jpeg_folder from public.rolls where start_date='2026-09-10';
commit;

\echo '--- [5] compare-and-set: second writer finds the roll already linked (expect 0 rows) ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
update public.rolls set drive_parent_folder_id='P2', drive_jpeg_folder_id='J2', drive_raw_folder_id='R2', drive_selects_folder_id='S2'
 where start_date='2026-09-11' and drive_parent_folder_id is null;
commit;

\echo '--- [6] user_settings: A inserts own row; user_id defaults to auth.uid() ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
insert into public.user_settings (drive_archive_root_id, drive_archive_root_name) values ('ROOT','35mm') returning user_id, drive_archive_root_id;
commit;

\echo '--- [7] one row per user (expect duplicate key) ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
insert into public.user_settings (drive_archive_root_id) values ('ROOT2');
rollback;

\echo '--- [8] user B cannot see or modify A settings or write as A ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
select count(*) as visible_to_b from public.user_settings;
update public.user_settings set drive_archive_root_id='HIJACK';
insert into public.user_settings (user_id, drive_archive_root_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','X');
rollback;

\echo '--- [9] anon has no access ---'
begin; set local role anon; select count(*) from public.user_settings; rollback;

\echo '--- [10] updated_at trigger moves on update ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
select pg_sleep(0.01);
update public.user_settings set drive_archive_root_name='35mm film' returning updated_at > created_at as bumped;
commit;

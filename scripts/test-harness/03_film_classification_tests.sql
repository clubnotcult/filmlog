-- Film classification migration (20261009090000) against realistic LEGACY data.
-- Run after 00_fake_auth.sql and every migration EXCEPT the classification one;
-- this file applies it itself so the before/after can be compared.
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','c@example.com');

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into public.film_stocks (name, iso, format) values
  ('Kodak Portra 400', 400, '35mm'),
  ('Kodak Tri-X 400', 400, '35'),
  ('Kodak Ektachrome E100', 100, '35mm'),
  ('Ilford FP4+', 125, '135'),
  ('JHC Street Pan 400', 400, '35mm'),
  ('Kodak Gold 200', 200, null),
  ('Fujifilm Instax Mini', 800, 'Instant'),
  ('Cinestill 800T', 800, ' 35MM '),
  ('Cinestill BwXX', 250, '35mm'),
  ('Lomochrome Purple', 400, '35mm'),
  ('Kodak Portra 160 120', 160, '120'),
  ('Mystery Roll', null, '6x9 weird'),
  ('Blank Format Film', 400, ''),
  ('Agfa Scala 200', 200, '35mm'),
  ('Ilford HP5+ Large', 400, '4x5');
insert into public.cameras (name, format, shutter_speeds) values ('Canon A-1','35mm',array['1/60','1/125']);
insert into public.lenses (name, focal_length, aperture_stops) values ('FD 50','50mm',array[1.8,2.8]);
insert into public.film_inventory_items (film_stock_id, quantity) select id, 2 from public.film_stocks where name = 'Kodak Portra 400';
select (public.create_roll((select id from public.film_inventory_items limit 1),(select id from public.cameras limit 1),(select id from public.lenses limit 1),'2026-09-10')).id as id \gset roll_
insert into public.frames (roll_id, frame_number, drive_file_id, drive_filename, selection)
  values (:'roll_id', 1, 'DRIVEFILE1', 'a.jpg', 'star');
commit;

create temp table before_counts as
  select (select count(*) from public.rolls) r, (select count(*) from public.frames) f,
         (select count(*) from public.film_stocks) s;

\echo '--- applying classification migration ---'
\ir ../../supabase/migrations/20261009090000_film_classification.sql

\echo '--- [1] backfill result per legacy stock ---'
select name, format, film_type from public.film_stocks order by name;

\echo '--- [2] nothing lost: row counts unchanged, roll + frame + drive mapping intact ---'
select (b.r = (select count(*) from public.rolls)) rolls_same,
       (b.f = (select count(*) from public.frames)) frames_same,
       (b.s = (select count(*) from public.film_stocks)) stocks_same from before_counts b;
select f.drive_file_id, f.selection, r.film_stock_id = (select id from public.film_stocks where name='Kodak Portra 400') as roll_still_on_portra
  from public.frames f join public.rolls r on r.id = f.roll_id;

\echo '--- [3] create a stock (35mm B&W) and a 120 color negative; both persist ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into public.film_stocks (name, iso, format, film_type) values ('Ilford Delta 100', 100, '35mm', 'bw_negative'), ('Portra 400 120', 400, '120', 'color_negative') returning name, format, film_type;
commit;

\echo '--- [4] edit: classify a previously unclassified stock ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
update public.film_stocks set film_type = 'color_negative', format = '35mm' where name = 'Mystery Roll' returning name, format, film_type;
commit;

\echo '--- [5] free text is rejected (expect two check violations) ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into public.film_stocks (name, format, film_type) values ('Bad A', '35mm', 'weird_type');
rollback;
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into public.film_stocks (name, format, film_type) values ('Bad B', 'Super 8', 'color_negative');
rollback;

\echo '--- [6] unclassified stays null and legacy inserts without the new fields still work ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into public.film_stocks (name) values ('Legacy-style insert') returning name, format, film_type;
rollback;

\echo '--- [7] type filter query shape: stocks of a type -> rolls -> frames ---'
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select count(*) as color_negative_frames from public.frames f join public.rolls r on r.id=f.roll_id
 where r.film_stock_id in (select id from public.film_stocks where film_type = 'color_negative');
select count(*) as bw_negative_frames from public.frames f join public.rolls r on r.id=f.roll_id
 where r.film_stock_id in (select id from public.film_stocks where film_type = 'bw_negative');
rollback;

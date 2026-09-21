-- Behavioral test of Phase 2: create_roll RPC, RLS isolation, FK-restrict
-- deletes, check-constraint floors, and triggers. Run as superuser; uses
-- `set local request.jwt.claims` + `set local role` to simulate each user
-- exactly as PostgREST/Supabase would for an authenticated request.

\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------------
-- Fixtures: two users
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.com');

\echo '--- [1] User A creates gear + film stock (quantity=2) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.cameras (name, format, shutter_speeds)
values ('Canon A-1', '35mm', array['B','1','1/2','1/4','1/8','1/15','1/30','1/60','1/125','1/250','1/500','1/1000'])
returning id, user_id, name;

insert into public.lenses (name, focal_length, aperture_stops)
values ('FD 50mm f/1.4', '50mm', array[1.4,2,2.8,4,5.6,8,11,16])
returning id, user_id, name;

insert into public.film_stocks (name, iso, format, quantity)
values ('Portra 400', 400, '35mm', 2)
returning id, user_id, name, quantity;
commit;

\echo '--- [2] User A calls create_roll (should decrement 2 -> 1) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select public.create_roll(
  (select id from public.film_stocks where name = 'Portra 400'),
  (select id from public.cameras where name = 'Canon A-1'),
  (select id from public.lenses where name = 'FD 50mm f/1.4'),
  '2026-09-10',
  'Maddie, Cats, Kendrick, PMC',
  null
);
commit;

select name, quantity from public.film_stocks;
select status, current_frame, custom_title, start_date, end_date from public.rolls;

\echo '--- [3] User A calls create_roll again (should decrement 1 -> 0) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.create_roll(
  (select id from public.film_stocks where name = 'Portra 400'),
  (select id from public.cameras where name = 'Canon A-1'),
  (select id from public.lenses where name = 'FD 50mm f/1.4'),
  '2026-09-15', null, null
);
commit;

select name, quantity from public.film_stocks;
select count(*) as roll_count from public.rolls;

\echo '--- [4] User A calls create_roll a third time: EXPECT failure, no partial writes ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.create_roll(
  (select id from public.film_stocks where name = 'Portra 400'),
  (select id from public.cameras where name = 'Canon A-1'),
  (select id from public.lenses where name = 'FD 50mm f/1.4'),
  '2026-09-20', null, null
);
commit;

\echo '--- After failed attempt: quantity should still be 0, roll_count should still be 2 ---'
select name, quantity from public.film_stocks;
select count(*) as roll_count from public.rolls;

\echo '--- [5] RLS isolation: User B should see NONE of User A rows ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select count(*) as cameras_visible_to_b from public.cameras;
select count(*) as lenses_visible_to_b from public.lenses;
select count(*) as film_stocks_visible_to_b from public.film_stocks;
select count(*) as rolls_visible_to_b from public.rolls;
commit;

\echo '--- [6] RLS write isolation: User B tries to update User A camera (expect 0 rows affected) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
update public.cameras set notes = 'hacked' where name = 'Canon A-1';
commit;

select notes from public.cameras where name = 'Canon A-1';

\echo '--- [7] FK RESTRICT: User A tries to delete camera used by a roll (expect 23503 error) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
delete from public.cameras where name = 'Canon A-1';
commit;

\echo '--- [8] Deactivate instead (should succeed, no error) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
update public.cameras set active = false where name = 'Canon A-1';
commit;
select name, active from public.cameras;

\echo '--- [9] Check constraint floor: direct quantity = -1 should fail with 23514 ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
update public.film_stocks set quantity = -1 where name = 'Portra 400';
commit;

\echo '--- [10] updated_at trigger fires on update ---'
select name, created_at = updated_at as created_equals_updated_before
from public.film_stocks where name = 'Portra 400';

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
update public.film_stocks set storage_notes = 'fridge' where name = 'Portra 400';
commit;

select name, created_at < updated_at as updated_at_advanced
from public.film_stocks where name = 'Portra 400';

\echo '--- [11] frames unique(roll_id, frame_number) constraint (Phase 3 dependency, sanity check now) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into public.frames (roll_id, frame_number, shutter_speed, aperture, lens_id)
select id, 1, '1/125', 8, (select id from public.lenses where name = 'FD 50mm f/1.4')
from public.rolls limit 1;

insert into public.frames (roll_id, frame_number, shutter_speed, aperture, lens_id)
select id, 1, '1/60', 5.6, (select id from public.lenses where name = 'FD 50mm f/1.4')
from public.rolls limit 1;
commit;

\echo '--- [12] adjust_film_stock_quantity: atomic increment/decrement ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.adjust_film_stock_quantity(
  (select id from public.film_stocks where name = 'Portra 400'), 3
);
commit;
select name, quantity from public.film_stocks where name = 'Portra 400';

\echo '--- [13] adjust_film_stock_quantity: guarded against going negative (expect friendly error, not 23514) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.adjust_film_stock_quantity(
  (select id from public.film_stocks where name = 'Portra 400'), -100
);
commit;
select name, quantity from public.film_stocks where name = 'Portra 400';

\echo '--- [14] adjust_film_stock_quantity: User B cannot adjust User A stock (expect "not found") ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select public.adjust_film_stock_quantity(
  (select id from public.film_stocks where name = 'Portra 400'), 1
);
commit;

\echo '=== DONE ==='

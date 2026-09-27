-- Behavioral test of Film Log's schema + functions against a real Postgres
-- instance, simulating Supabase's RLS via `set local role` + `request.jwt.claims`
-- exactly as PostgREST/Supabase would for an authenticated request.
--
-- Covers: create_roll (v2, against film_inventory_items), RLS isolation,
-- FK-restrict deletes, check-constraint floors, triggers, the Phase 3 split
-- migration's data model, and save_frame_and_advance / finish_roll /
-- reopen_roll — including the spec's Active Roll test scenarios wherever
-- they're verifiable at the database layer (inheritance itself is composed
-- client-side; what the DB must guarantee is atomicity, frame numbering, and
-- that historical frames never change).

\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------------
-- Fixtures: two users, gear, film stock + inventory item
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.com');

\echo '--- [1] User A creates gear, a film stock TYPE, and a physical inventory item (quantity=2) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.cameras (name, format, shutter_speeds)
values ('Canon A-1', '35mm', array['B','1','1/2','1/4','1/8','1/15','1/30','1/60','1/125','1/250','1/500','1/1000'])
returning id, user_id, name;

insert into public.lenses (name, focal_length, aperture_stops)
values ('FD 28mm f/2.8', '28mm', array[2.8,4,5.6,8,11,16,22])
returning id, user_id, name;

insert into public.lenses (name, focal_length, aperture_stops)
values ('FD 50mm f/1.4', '50mm', array[1.4,2,2.8,4,5.6,8,11,16])
returning id, user_id, name;

insert into public.film_stocks (name, iso, format)
values ('Portra 400', 400, '35mm')
returning id, user_id, name;

insert into public.film_inventory_items (film_stock_id, quantity, expiration_date, storage_notes)
select id, 2, '2027-06-01', 'Fridge' from public.film_stocks where name = 'Portra 400'
returning id, film_stock_id, quantity;
commit;

\echo '--- [2] User A calls create_roll against the inventory item (should decrement 2 -> 1) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select public.create_roll(
  (select id from public.film_inventory_items limit 1),
  (select id from public.cameras where name = 'Canon A-1'),
  (select id from public.lenses where name = 'FD 28mm f/2.8'),
  '2026-09-10',
  'Maddie, Cats, Kendrick, PMC',
  null
);
commit;

select fs.name, fi.quantity from public.film_inventory_items fi join public.film_stocks fs on fs.id = fi.film_stock_id;
select status, current_frame, custom_title, film_stock_id, film_inventory_item_id from public.rolls;

\echo '--- [3] User A calls create_roll again (should decrement 1 -> 0) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.create_roll(
  (select id from public.film_inventory_items limit 1),
  (select id from public.cameras where name = 'Canon A-1'),
  (select id from public.lenses where name = 'FD 28mm f/2.8'),
  '2026-09-15', null, null
);
commit;

select quantity from public.film_inventory_items;
select count(*) as roll_count from public.rolls;

\echo '--- [4] User A calls create_roll a third time: EXPECT failure, no partial writes ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.create_roll(
  (select id from public.film_inventory_items limit 1),
  (select id from public.cameras where name = 'Canon A-1'),
  (select id from public.lenses where name = 'FD 28mm f/2.8'),
  '2026-09-20', null, null
);
commit;

\echo '--- After failed attempt: quantity should still be 0, roll_count should still be 2 ---'
select quantity from public.film_inventory_items;
select count(*) as roll_count from public.rolls;

\echo '--- [5] RLS isolation: User B should see NONE of User A rows, including film_inventory_items ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select count(*) as cameras_visible_to_b from public.cameras;
select count(*) as film_stocks_visible_to_b from public.film_stocks;
select count(*) as inventory_items_visible_to_b from public.film_inventory_items;
select count(*) as rolls_visible_to_b from public.rolls;
commit;

\echo '--- [6] RLS write isolation: User B tries to update User A camera (expect 0 rows affected) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
update public.cameras set notes = 'hacked' where name = 'Canon A-1';
commit;
select notes from public.cameras where name = 'Canon A-1';

\echo '--- [7] FK RESTRICT: User A tries to delete film stock used by inventory items (expect 23503) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
delete from public.film_stocks where name = 'Portra 400';
commit;

\echo '--- [8] Deactivate instead (should succeed, no error) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
update public.film_stocks set active = false where name = 'Portra 400';
commit;
select name, active from public.film_stocks;

\echo '--- [9] Check constraint floor: direct quantity = -1 on inventory item should fail with 23514 ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
update public.film_inventory_items set quantity = -1;
commit;

\echo '--- [10] updated_at trigger fires on update ---'
select created_at = updated_at as created_equals_updated_before from public.film_inventory_items;
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
update public.film_inventory_items set storage_notes = 'moved to freezer';
commit;
select created_at < updated_at as updated_at_advanced from public.film_inventory_items;

\echo '--- [11] adjust_film_inventory_item_quantity: atomic increment/decrement ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.adjust_film_inventory_item_quantity((select id from public.film_inventory_items limit 1), 3);
commit;
select quantity from public.film_inventory_items;

\echo '--- [12] adjust_film_inventory_item_quantity: guarded against going negative ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.adjust_film_inventory_item_quantity((select id from public.film_inventory_items limit 1), -100);
commit;
select quantity from public.film_inventory_items;

-- =============================================================================
-- PHASE 3: Active Roll — save_frame_and_advance / finish_roll / reopen_roll
-- =============================================================================

\echo ''
\echo '=== PHASE 3 TESTS ==='
\echo ''

\echo '--- [T1] Basic save: Frame 1, no frames existed before -> frame_number = 1 ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  '1/125', 8, (select id from public.lenses where name = 'FD 28mm f/2.8'), 0, null
);
commit;
select frame_number, shutter_speed, aperture, push_pull from public.frames order by frame_number;
select current_frame from public.rolls order by created_at limit 1;

\echo '--- [T2] Required-field validation: missing shutter speed is rejected, no frame created ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  null, 8, (select id from public.lenses where name = 'FD 28mm f/2.8'), 0, null
);
commit;
select count(*) as frame_count_unchanged from public.frames;

\echo '--- [T2b] Required-field validation: missing aperture is rejected ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  '1/125', null, (select id from public.lenses where name = 'FD 28mm f/2.8'), 0, null
);
commit;
select count(*) as frame_count_still_unchanged from public.frames;

\echo '--- [T3] Sequential frame numbering: save Frame 2 with different values, push +1 ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  '1/125', 5.6, (select id from public.lenses where name = 'FD 28mm f/2.8'), 1, 'Backlit storefront'
);
commit;
select frame_number, shutter_speed, aperture, push_pull, notes from public.frames order by frame_number;

\echo '--- [T4] Lens change mid-roll: Frame 3 uses the 50mm lens ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  '1/250', 2.8, (select id from public.lenses where name = 'FD 50mm f/1.4'), 1, null
);
commit;
select f.frame_number, f.aperture, l.name as lens_name, f.push_pull
from public.frames f join public.lenses l on l.id = f.lens_id
order by f.frame_number;

\echo '--- [T5] Historical independence: Frame 1 (push=0) unchanged after Frame 3 (push=1) exists ---'
select frame_number, push_pull from public.frames where frame_number = 1;
\echo 'Expect push_pull = 0 for frame 1, unaffected by later frames changing push to 1'

\echo '--- [T6] Unique (roll_id, frame_number): duplicate frame_number is rejected at the DB level ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into public.frames (roll_id, frame_number, shutter_speed, aperture, lens_id)
select id, 1, '1/60', 11, (select id from public.lenses where name = 'FD 28mm f/2.8')
from public.rolls order by created_at limit 1;
commit;

\echo '--- [T7] Frame beyond 36: save frames up through 37 to confirm no hidden limit ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare
  v_roll_id uuid;
  v_lens_id uuid;
  i integer;
begin
  select id into v_roll_id from public.rolls order by created_at limit 1;
  select id into v_lens_id from public.lenses where name = 'FD 28mm f/2.8';
  for i in 4..37 loop
    perform public.save_frame_and_advance(v_roll_id, '1/125', 8, v_lens_id, 0, null);
  end loop;
end;
$$;
commit;
select max(frame_number) as highest_frame_saved from public.frames;
\echo 'Expect 37 -- frame numbering has no hard 36 cap'

\echo '--- [T8] save_frame_and_advance on a non-active (completed) roll is rejected ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.finish_roll((select id from public.rolls order by created_at limit 1));
commit;
select status, end_date from public.rolls order by created_at limit 1;

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  '1/125', 8, (select id from public.lenses where name = 'FD 28mm f/2.8'), 0, null
);
commit;
select max(frame_number) as still_37_not_38 from public.frames;

\echo '--- [T9] finish_roll a second time is rejected (already completed) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.finish_roll((select id from public.rolls order by created_at limit 1));
commit;

\echo '--- [T10] reopen_roll: status -> active, end_date cleared, current_frame = 38 (next after 37) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.reopen_roll((select id from public.rolls order by created_at limit 1));
commit;
select status, end_date, current_frame from public.rolls order by created_at limit 1;

\echo '--- [T11] After reopen, Frame 38 saves correctly (continuing past the old completed point) ---'
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  '1/500', 16, (select id from public.lenses where name = 'FD 50mm f/1.4'), -1, 'Reopened and continued'
);
commit;
select max(frame_number) as highest_after_reopen from public.frames;

\echo '--- [T12] User B cannot save a frame on User A roll (expect "Roll not found") ---'
-- Passes a syntactically valid (but arbitrary) lens id purely to get past the
-- "lens is required" presence check and reach the real thing under test: the
-- roll ownership lookup, which must fail for User B regardless of what lens
-- id was supplied.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select public.save_frame_and_advance(
  (select id from public.rolls order by created_at limit 1),
  '1/125', 8, '00000000-0000-0000-0000-000000000000'::uuid, 0, null
);
commit;

\echo '=== DONE ==='

-- Frame numbering is 1-based end to end: a new roll starts at Frame 1, the
-- first logged exposure is Frame 1, and reopening resumes at max+1.
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','d@example.com');
begin; set local role authenticated; set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';
insert into public.cameras (name, format, shutter_speeds) values ('Canon New F-1','35mm',array['1/60','1/125']);
insert into public.lenses (name, focal_length, aperture_stops) values ('FD 50','50mm',array[1.8,2.8]);
insert into public.film_stocks (name, iso, format) values ('Portra 400',400,'35mm');
insert into public.film_inventory_items (film_stock_id, quantity) select id, 3 from public.film_stocks;
select (public.create_roll((select id from public.film_inventory_items limit 1),(select id from public.cameras limit 1),(select id from public.lenses limit 1),'2026-10-10')).id as id \gset r_
select current_frame as new_roll_current_frame from public.rolls where id = :'r_id';
select frame_number as first_logged_frame from public.save_frame_and_advance(:'r_id','1/125',2.8,(select id from public.lenses limit 1));
select current_frame as after_first from public.rolls where id = :'r_id';
select frame_number as second_logged_frame from public.save_frame_and_advance(:'r_id','1/125',2.8,(select id from public.lenses limit 1));
select current_frame as after_second from public.rolls where id = :'r_id';
select status from (select (public.finish_roll(:'r_id')).status) s;
select current_frame as after_reopen from (select (public.reopen_roll(:'r_id')).current_frame) s;
select array_agg(frame_number order by frame_number) as stored_frames from public.frames where roll_id = :'r_id';
commit;

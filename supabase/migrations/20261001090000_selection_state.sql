-- Film Log — favorites become a three-level selection state.
--
-- One nullable text column replaces the is_favorite boolean:
--   null    = unmarked (the normal archive photograph)
--   'heart' = worth spending time on
--   'star'  = one of the really good ones
-- Mutually exclusive by construction (a single column can hold one value),
-- ordered by meaning not by number: it is deliberately NOT an integer score,
-- so it can't be averaged, summed, or mistaken for a rating, and an LLM
-- reading the export sees "heart"/"star" rather than 1/2.
--
-- Migration mapping: every existing favorite becomes a heart. A favorite was
-- "I like this" — the first level — and nothing in the old data says any of
-- them were star-grade, so promoting any would invent a judgment. Stars only
-- ever come from a deliberate later choice.
--
-- Backfill, verify, THEN drop: the column is only removed after the migration
-- itself proves every favorite landed as a heart, and the whole file runs in
-- one transaction, so a mismatch aborts with the old column untouched.
-- Selection is independent of exposure_evaluation on purpose — no constraint,
-- trigger, or default links them.

alter table public.frames
  add column selection text check (selection in ('heart', 'star'));

update public.frames set selection = 'heart' where is_favorite;

do $$
declare
  v_old integer;
  v_new integer;
begin
  select count(*) into v_old from public.frames where is_favorite;
  select count(*) into v_new from public.frames where selection = 'heart';
  if v_old <> v_new then
    raise exception 'Favorites migration mismatch: % favorites, % hearts', v_old, v_new;
  end if;
end
$$;

drop index if exists public.idx_frames_is_favorite;
alter table public.frames drop column is_favorite;

-- Partial index: unmarked frames are the overwhelming majority, and the only
-- queries that care (filter by heart/star) never want them.
create index idx_frames_selection on public.frames (user_id, selection)
  where selection is not null;

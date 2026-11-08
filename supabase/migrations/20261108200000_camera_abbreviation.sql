-- Camera abbreviation: a short, user-chosen label for a camera body
-- ("F-1", "A-1", "AF-1"), shown in compact places such as the line under
-- each image in the gallery.
--
-- Additive and nullable: existing cameras keep every value they have and
-- simply have no abbreviation until one is entered. Nothing is derived or
-- backfilled — an abbreviation is always the photographer's own choice.

alter table public.cameras
  add column abbreviation text
    check (abbreviation is null or char_length(btrim(abbreviation)) between 1 and 12);

comment on column public.cameras.abbreviation is
  'Short label chosen by the user (e.g. F-1 for Canon New F-1); null = none set. 1–12 characters.';

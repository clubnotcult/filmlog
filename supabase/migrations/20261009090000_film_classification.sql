-- Film Log — structured film stock classification and authoritative format.
--
-- film_stocks gets two controlled fields:
--   film_type  what kind of film it is (color negative, B&W negative, ...)
--   format     the film format; now the single source of truth, constrained
--              to a fixed list (it was free text before)
--
-- Both feed the automatic system tags, Explore filters, Drive descriptions and
-- the AI export. Nothing here touches rolls, frames, tags, Drive columns or
-- image mappings: film_stocks rows are updated in place, so every roll and
-- frame keeps pointing at the same stock and picks the new fields up through
-- that association. No data is deleted.
--
-- film_type backfill: only names that are unambiguous for their kind are
-- classified (Portra, Tri-X, Ektachrome, Instax...). Anything else stays NULL —
-- "unclassified" — rather than being guessed, and the app asks for it the next
-- time that stock is edited. No default like 'other' is applied, because that
-- would silently claim a classification nobody made.
--
-- format normalization: recognised spellings map to the canonical value;
-- NULL/blank stays NULL ("unspecified"); anything unrecognised becomes 'other'
-- and is listed in a NOTICE so it can be reviewed.

alter table public.film_stocks
  add column film_type text;

alter table public.film_stocks
  add constraint film_stocks_film_type_check check (
    film_type is null or film_type in
      ('color_negative','bw_negative','color_slide','bw_reversal','instant','other')
  );

-- --- format --------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id, name, format from public.film_stocks
    where format is not null and btrim(format) <> ''
      and lower(btrim(format)) not in (
        '35mm','35 mm','35','135','135 film',
        '120','120mm','medium format','mf','6x6','6x7','6x4.5',
        'large format','lf','4x5','5x7','8x10','sheet','sheet film',
        'half frame','half-frame','halfframe','half',
        'aps','aps film',
        'instant','polaroid','instax')
  loop
    raise notice 'film_stocks "%": format "%" is not a recognised format, set to "other"', r.name, r.format;
  end loop;
end $$;

update public.film_stocks
set format = case
  when btrim(format) = '' then null
  when lower(btrim(format)) in ('35mm','35 mm','35','135','135 film') then '35mm'
  when lower(btrim(format)) in ('120','120mm','medium format','mf','6x6','6x7','6x4.5') then '120'
  when lower(btrim(format)) in ('large format','lf','4x5','5x7','8x10','sheet','sheet film') then 'large_format'
  when lower(btrim(format)) in ('half frame','half-frame','halfframe','half') then 'half_frame'
  when lower(btrim(format)) in ('aps','aps film') then 'aps'
  when lower(btrim(format)) in ('instant','polaroid','instax') then 'instant'
  else 'other'
end
where format is not null;

alter table public.film_stocks
  add constraint film_stocks_format_check check (
    format is null or format in
      ('35mm','120','large_format','half_frame','aps','instant','other')
  );

-- --- film_type backfill (name-based, conservative) --------------------------
update public.film_stocks set film_type = case
  when name ~* '(instax|polaroid|instant|i-type|sx-70)'                         then 'instant'
  when name ~* '(scala|dr5|fomapan\s*r|rpx\s*25\s*r|reversal.*(b\s*&\s*w|bw)|(b\s*&\s*w|bw).*reversal)' then 'bw_reversal'
  when name ~* '(ektachrome|kodachrome|velvia|provia|astia|\mslide\M|\me100\M)'       then 'color_slide'
  when name ~* '(tri-?x|hp5|fp4|pan\s*f|delta\s*\d|t-?max|acros|xp2|kentmere|fomapan|arista|street\s*pan|\mpan\M|retropan|bwxx|neopan|double-?x|b\s*&\s*w|b/w|\mbw\M|black\s*(and|&)?\s*white)' then 'bw_negative'
  when name ~* '(portra|\mgold\M|ultramax|colou?r\s*plus|ektar|superia|pro\s*400h|\mc200\M|cinestill|\mvision\s*3|800t|\m50d\M|fujicolor|lomochrome|kodacolor|phoenix|\mcolou?r\M)' then 'color_negative'
  else null
end
where film_type is null;

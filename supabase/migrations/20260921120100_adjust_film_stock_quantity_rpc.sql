-- Film Log — Phase 2: atomic inventory quantity adjustment
--
-- The inventory stepper adjusts quantity by +1/-1. A plain read-then-write
-- from the app has a narrow race window under truly concurrent requests
-- (two overlapping decrements could both read the same starting value). This
-- function makes the read-modify-write a single atomic statement instead, the
-- same pattern used by create_roll. The `quantity >= 0` check constraint
-- remains the hard backstop either way.

create or replace function public.adjust_film_stock_quantity(
  p_id    uuid,
  p_delta integer
)
returns public.film_stocks
language plpgsql
security invoker
as $$
declare
  v_stock public.film_stocks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Single guarded statement: the "quantity + p_delta >= 0" check is part of
  -- the same atomic UPDATE, so there's no separate read-then-write race.
  update public.film_stocks
  set quantity = quantity + p_delta
  where id = p_id and user_id = auth.uid() and quantity + p_delta >= 0
  returning * into v_stock;

  if found then
    return v_stock;
  end if;

  -- Nothing matched — figure out why, for a message the UI can show as-is.
  if exists (
    select 1 from public.film_stocks where id = p_id and user_id = auth.uid()
  ) then
    raise exception 'Quantity can''t go below zero';
  else
    raise exception 'Film stock not found';
  end if;
end;
$$;

grant execute on function public.adjust_film_stock_quantity(uuid, integer) to authenticated;
revoke execute on function public.adjust_film_stock_quantity(uuid, integer) from anon, public;

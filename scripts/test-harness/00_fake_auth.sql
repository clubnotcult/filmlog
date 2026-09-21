-- Minimal stand-in for what a real Supabase project provides out of the box:
-- the `auth.users` table, an `auth.uid()` function reading a settable JWT
-- claim, and the `authenticated` / `anon` database roles with the same
-- default grants Supabase applies. None of this belongs in the app's own
-- migrations — it's test-harness-only scaffolding to exercise the real
-- migration files against a genuine Postgres instance.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

grant usage on schema public to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Real Supabase projects grant both roles USAGE on `auth` and EXECUTE on
-- auth.uid() out of the box; without this, any function/policy that calls
-- auth.uid() fails with "permission denied for schema auth" even though the
-- app's own migrations never touch this — it's purely bootstrap parity.
grant usage on schema auth to authenticated, anon, public;
grant execute on function auth.uid() to authenticated, anon, public;

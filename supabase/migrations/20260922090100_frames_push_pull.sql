-- Film Log — Phase 3: push/pull exposure compensation on frames.
--
-- Stored independently on every saved frame (never derived), defaulting to 0
-- (normal development). Inherits forward through the Active Roll UI exactly
-- like shutter/aperture/lens — that inheritance is a client-side concern when
-- composing the next frame's starting values; the column itself just holds
-- whatever value was true for that specific saved frame, permanently.
--
-- numeric(3,1) allows half-stop pushes/pulls (e.g. 0.5, -1.5) as well as the
-- whole-stop values shown in the spec (0, +1, +2, -1), without an artificial
-- range limit — real push/pull processing occasionally goes beyond ±2.

alter table public.frames
  add column push_pull numeric(3,1) not null default 0;

comment on column public.frames.push_pull is
  'Stops pushed (+) or pulled (-) in development relative to box speed. 0 = normal. Independent per frame; inherits forward only as a UI default for the next frame, never recalculated from other frames.';

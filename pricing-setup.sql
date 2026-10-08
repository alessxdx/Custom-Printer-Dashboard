-- One-time setup for the Pricing Calculator tab (js/pricing.js).
-- Run in the Supabase SQL editor (project mtuteycxdhlqpdupqolb).
-- Same convention as tracker-setup.sql: RLS enabled with an allow-all
-- policy so the public anon key can read/write. The app seeds the three
-- default rules (Accessories & spares, TK180 printers, Standard printers)
-- the first time it finds this table empty.

create table if not exists pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  match text,                 -- comma-separated keywords; empty = fallback rule
  sort_order int not null default 0,
  tiers jsonb not null,       -- [{"min":1,"mult":1.2,"addon":30}, ...]
  types jsonb not null        -- [{"name":"End user","markups":[1,0.6,0.6]}, ...]
);

alter table pricing_profiles enable row level security;
drop policy if exists "pricing_profiles_all" on pricing_profiles;
create policy "pricing_profiles_all" on pricing_profiles for all using (true) with check (true);

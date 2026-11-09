-- SpeedLab Pro – Supabase schema
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";

-- Profiles (one per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  default_strategy text default 'mobile' check (default_strategy in ('mobile', 'desktop')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Website projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null check (char_length(name) between 1 and 120),
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id, created_at desc);

-- Scans (summary columns + full normalised report as JSONB)
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  url text not null,
  final_url text,
  strategy text not null check (strategy in ('mobile', 'desktop')),
  performance smallint,
  accessibility smallint,
  best_practices smallint,
  seo smallint,
  lcp_ms real,
  fcp_ms real,
  cls real,
  tbt_ms real,
  ttfb_ms real,
  total_bytes bigint,
  issue_count integer,
  platform text,
  report jsonb not null
);
create index if not exists scans_user_idx on public.scans (user_id, created_at desc);
create index if not exists scans_url_idx on public.scans (user_id, final_url);

-- Generated PDF report metadata
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  scan_id uuid references public.scans (id) on delete cascade,
  compare_scan_id uuid references public.scans (id) on delete set null,
  title text,
  created_at timestamptz not null default now()
);
create index if not exists reports_user_idx on public.reports (user_id, created_at desc);

-- Saved recommendations (to-do list of fixes)
create table if not exists public.saved_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  scan_id uuid references public.scans (id) on delete set null,
  issue_type text not null,
  title text not null,
  priority text not null check (priority in ('critical', 'high', 'medium', 'low')),
  issue jsonb not null,
  status text not null default 'open' check (status in ('open', 'in-progress', 'done', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists recs_user_idx on public.saved_recommendations (user_id, created_at desc);

-- Row Level Security: users can only see their own rows when using the anon key.
-- The API server uses the service-role key and filters by user_id explicitly.
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.scans enable row level security;
alter table public.reports enable row level security;
alter table public.saved_recommendations enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "own scans" on public.scans;
create policy "own scans" on public.scans for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "own reports" on public.reports;
create policy "own reports" on public.reports for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "own recommendations" on public.saved_recommendations;
create policy "own recommendations" on public.saved_recommendations for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

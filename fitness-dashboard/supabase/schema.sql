-- Fitness Dashboard schema
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)

-- Completed activities, normalized from every source
create table if not exists activities (
  id           bigserial primary key,
  source       text not null,              -- 'intervals_icu' | 'lyfta' | 'health_auto_export'
  external_id  text not null,              -- the id from the source system, for de-duping
  sport        text,                       -- 'run' | 'ride' | 'swim' | 'strength' | 'nutrition' | ...
  name         text,
  start_time   timestamptz not null,
  duration_s   integer,
  distance_m   numeric,
  load         numeric,                    -- training load / TSS if the source provides one
  calories     numeric,
  raw          jsonb,                      -- full original payload, kept for anything not modeled above
  inserted_at  timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists activities_start_time_idx on activities (start_time desc);
create index if not exists activities_source_idx on activities (source);

-- Daily wellness / nutrition snapshot (one row per day per metric source)
create table if not exists daily_metrics (
  id           bigserial primary key,
  source       text not null,              -- 'intervals_icu' | 'macrofactor'
  metric_date  date not null,
  calories_in  numeric,
  protein_g    numeric,
  carbs_g      numeric,
  fat_g        numeric,
  weight_kg    numeric,
  sleep_s      integer,
  hrv          numeric,
  resting_hr   numeric,
  readiness    numeric,
  raw          jsonb,
  inserted_at  timestamptz not null default now(),
  unique (source, metric_date)
);

-- Habit definitions
create table if not exists habits (
  id           bigserial primary key,
  name         text not null,
  emoji        text,
  target_per_week integer default 7,
  archived     boolean not null default false,
  sort_order   integer default 0,
  created_at   timestamptz not null default now()
);

-- One row per habit per day it was marked done
create table if not exists habit_logs (
  id           bigserial primary key,
  habit_id     bigint not null references habits(id) on delete cascade,
  log_date     date not null,
  created_at   timestamptz not null default now(),
  unique (habit_id, log_date)
);

-- Planned workouts / calendar entries you create yourself
create table if not exists planned_workouts (
  id           bigserial primary key,
  plan_date    date not null,
  sport        text,                       -- 'run' | 'ride' | 'swim' | 'strength' | 'rest' | ...
  title        text not null,
  details      text,
  source       text default 'manual',      -- 'manual' | 'intervals_icu' (if you later pull planned events too)
  external_id  text,
  completed    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists planned_workouts_date_idx on planned_workouts (plan_date);

-- Row Level Security: this is a single-user app, but keep RLS on and use the
-- anon key only for reads. Writes go through the service_role key from the
-- GitHub Actions sync job and from a simple password-gated habit/plan UI.
alter table activities enable row level security;
alter table daily_metrics enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table planned_workouts enable row level security;

create policy "public read" on activities for select using (true);
create policy "public read" on daily_metrics for select using (true);
create policy "public read" on habits for select using (true);
create policy "public read" on habit_logs for select using (true);
create policy "public read" on planned_workouts for select using (true);

-- Habit/plan writes from the browser use the anon key too (this is a personal,
-- unlisted tool -- if you ever share the link, tighten these policies or add
-- Supabase Auth). Sync-job writes use the service_role key, which bypasses RLS.
create policy "public write habit_logs" on habit_logs for insert with check (true);
create policy "public delete habit_logs" on habit_logs for delete using (true);
create policy "public write planned_workouts" on planned_workouts for all using (true) with check (true);

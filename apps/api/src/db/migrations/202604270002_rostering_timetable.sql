-- TASK-001: timetable and timetable_period schema for roster schedule planning.
-- Requires 202604270001_rostering_standalone_auth.sql for roster_schools.

-- migrate:up
create table if not exists roster_timetables (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  term_id text not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  template_key text,
  template_version integer not null default 1,
  timezone text not null default 'Asia/Hong_Kong',
  default_period_minutes integer not null default 40 check (default_period_minutes > 0),
  am_period_indexes integer[] not null default '{}',
  pm_period_indexes integer[] not null default '{}',
  half_day_boundary_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  structure_confirmed_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  unique (school_id, term_id, name),
  check (published_at is null or status in ('published', 'archived')),
  check (half_day_boundary_time is not null or (cardinality(am_period_indexes) > 0 and cardinality(pm_period_indexes) > 0))
);

create table if not exists roster_timetable_periods (
  id text primary key,
  timetable_id text not null references roster_timetables(id) on delete cascade,
  school_id text not null references roster_schools(id) on delete restrict,
  day_index integer not null check (day_index between 1 and 7),
  period_index integer not null check (period_index > 0),
  label text not null,
  start_time time not null,
  end_time time not null,
  half_day text not null check (half_day in ('am', 'pm')),
  sort_order integer not null,
  is_teaching_period boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (timetable_id, day_index, period_index),
  unique (timetable_id, sort_order),
  check (start_time < end_time)
);

create index if not exists roster_timetables_school_term_idx on roster_timetables (school_id, term_id);
create index if not exists roster_timetables_status_idx on roster_timetables (school_id, status);
create index if not exists roster_timetable_periods_lookup_idx on roster_timetable_periods (school_id, timetable_id, day_index, period_index);
create index if not exists roster_timetable_periods_half_day_idx on roster_timetable_periods (timetable_id, half_day, day_index, period_index);

-- migrate:down
drop table if exists roster_timetable_periods;
drop table if exists roster_timetables;

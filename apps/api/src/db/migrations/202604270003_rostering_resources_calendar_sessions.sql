-- TASK-002/TASK-059: local resources/calendar plus class session conflict schema.
-- Requires 202604270001_rostering_standalone_auth.sql and 202604270002_rostering_timetable.sql.

-- migrate:up
create table if not exists roster_terms (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  check (starts_on <= ends_on)
);

create table if not exists roster_rooms (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  name text not null,
  room_code text,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, room_code)
);

create table if not exists roster_equipment_resources (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  name text not null,
  resource_type text not null default 'equipment',
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists roster_school_calendar_exceptions (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  term_id text references roster_terms(id) on delete cascade,
  exception_date date not null,
  exception_type text not null check (exception_type in ('no_school', 'special_timetable', 'replacement_day')),
  replacement_day_index integer check (replacement_day_index is null or replacement_day_index between 1 and 7),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, exception_date)
);

create table if not exists roster_class_sessions (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  term_id text not null,
  timetable_id text not null references roster_timetables(id) on delete cascade,
  timetable_period_id text not null references roster_timetable_periods(id) on delete restrict,
  subject_id text not null,
  grade_level_id text not null,
  section text not null,
  room_id text references roster_rooms(id) on delete restrict,
  assigned_teacher_id text references roster_users(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, term_id, timetable_period_id, grade_level_id, section, subject_id)
);

create table if not exists roster_class_session_equipment_resources (
  class_session_id text not null references roster_class_sessions(id) on delete cascade,
  equipment_resource_id text not null references roster_equipment_resources(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (class_session_id, equipment_resource_id)
);

create unique index if not exists roster_class_sessions_teacher_period_active_idx
  on roster_class_sessions (school_id, term_id, assigned_teacher_id, timetable_period_id)
  where assigned_teacher_id is not null and status in ('draft', 'published');

create unique index if not exists roster_class_sessions_room_period_active_idx
  on roster_class_sessions (school_id, term_id, room_id, timetable_period_id)
  where room_id is not null and status in ('draft', 'published');

create index if not exists roster_class_sessions_timetable_idx on roster_class_sessions (school_id, timetable_id, timetable_period_id);
create index if not exists roster_class_sessions_teacher_idx on roster_class_sessions (school_id, term_id, assigned_teacher_id);
create index if not exists roster_class_sessions_class_idx on roster_class_sessions (school_id, term_id, grade_level_id, section);
create index if not exists roster_rooms_school_status_idx on roster_rooms (school_id, status);
create index if not exists roster_equipment_resources_school_status_idx on roster_equipment_resources (school_id, status);
create index if not exists roster_calendar_exceptions_school_term_date_idx on roster_school_calendar_exceptions (school_id, term_id, exception_date);

-- migrate:down
drop table if exists roster_class_session_equipment_resources;
drop table if exists roster_class_sessions;
drop table if exists roster_school_calendar_exceptions;
drop table if exists roster_equipment_resources;
drop table if exists roster_rooms;
drop table if exists roster_terms;

-- TASK-011: leave request and session impact schema with full-day/AM/PM duration support.
-- Requires 202604270001_rostering_standalone_auth.sql and 202604270003_rostering_resources_calendar_sessions.sql.

-- migrate:up
create table if not exists roster_leave_requests (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  teacher_id text not null references roster_users(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  duration_type text not null check (duration_type in ('full_day', 'am_half_day', 'pm_half_day')),
  leave_type text not null,
  reason text,
  coverage_required boolean not null default true,
  substitute_notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by text references roster_users(id) on delete restrict,
  reviewed_at timestamptz,
  created_by text not null references roster_users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date <= end_date),
  check ((status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null) or status in ('pending', 'cancelled'))
);

create table if not exists roster_leave_session_impacts (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  leave_request_id text not null references roster_leave_requests(id) on delete cascade,
  class_session_id text not null references roster_class_sessions(id) on delete restrict,
  impact_date date not null,
  coverage_required boolean not null default true,
  coverage_status text not null default 'unfilled' check (coverage_status in ('unfilled', 'assigned', 'covered', 'no_coverage_needed', 'cancelled')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  source text not null default 'system_computed' check (source in ('system_computed', 'admin_added', 'admin_removed')),
  admin_adjustment_reason text,
  adjusted_by text references roster_users(id) on delete restrict,
  adjusted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coverage_required or coverage_status = 'no_coverage_needed'),
  check ((source = 'system_computed' and admin_adjustment_reason is null) or (source <> 'system_computed')),
  check ((source in ('admin_added', 'admin_removed') and admin_adjustment_reason is not null and adjusted_by is not null and adjusted_at is not null) or source = 'system_computed')
);

create index if not exists roster_leave_requests_school_status_idx
  on roster_leave_requests (school_id, status, start_date, end_date);

create index if not exists roster_leave_requests_teacher_date_idx
  on roster_leave_requests (school_id, teacher_id, start_date, end_date);

create index if not exists roster_leave_requests_duration_idx
  on roster_leave_requests (school_id, duration_type);

create index if not exists roster_leave_session_impacts_leave_idx
  on roster_leave_session_impacts (leave_request_id, status);

create index if not exists roster_leave_session_impacts_session_date_idx
  on roster_leave_session_impacts (school_id, class_session_id, impact_date);

create index if not exists roster_leave_session_impacts_coverage_idx
  on roster_leave_session_impacts (school_id, coverage_status, coverage_required)
  where status = 'active';

create unique index if not exists roster_leave_session_impacts_active_unique_idx
  on roster_leave_session_impacts (leave_request_id, class_session_id, impact_date)
  where status = 'active';

-- migrate:down
drop table if exists roster_leave_session_impacts;
drop table if exists roster_leave_requests;

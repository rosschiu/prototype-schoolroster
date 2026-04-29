-- Steck Teacher Rostering Module PostgreSQL schema
-- Generated from apps/api/src/rostering/db/migrations.ts
-- Schema: draft_edu_v2
-- Data/seed rows are intentionally excluded.
-- Generated at: 2026-04-29T16:35:56.354Z

begin;

-- Migration: 202604270101_steck_core_schema_baseline
create schema if not exists "draft_edu_v2";

create table if not exists "draft_edu_v2"."schools" (
      id text primary key,
      name text not null,
      short_name text,
      timezone text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

create table if not exists "draft_edu_v2"."teachers" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      display_name text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

create table if not exists "draft_edu_v2"."auth_users" (
      id text primary key,
      email text not null unique,
      display_name text not null,
      preferred_locale text,
      password_hash text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

create table if not exists "draft_edu_v2"."school_memberships" (
      id text primary key,
      user_id text not null references "draft_edu_v2"."auth_users" (id) on delete cascade,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, school_id)
    );

create table if not exists "draft_edu_v2"."role_assignments" (
      id text primary key,
      membership_id text not null references "draft_edu_v2"."school_memberships" (id) on delete cascade,
      role text not null,
      actor_id text not null,
      created_at timestamptz not null default now(),
      unique (membership_id, role)
    );

create table if not exists "draft_edu_v2"."auth_sessions" (
      id text primary key,
      user_id text not null references "draft_edu_v2"."auth_users" (id) on delete cascade,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      active_role text not null,
      session_token_hash text not null unique,
      csrf_token_hash text not null,
      ip_address text,
      user_agent text,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz
    );

create table if not exists "draft_edu_v2"."academic_years" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      name text not null,
      starts_on date not null,
      ends_on date not null,
      active boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, name)
    );

create table if not exists "draft_edu_v2"."terms" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      academic_year_id text not null references "draft_edu_v2"."academic_years" (id) on delete cascade,
      name text not null,
      starts_on date not null,
      ends_on date not null,
      active boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, academic_year_id, name)
    );

create table if not exists "draft_edu_v2"."grade_levels" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      label text not null,
      short_label text not null,
      band_kind text not null default 'primary',
      sort_order integer not null default 0,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, label)
    );

create table if not exists "draft_edu_v2"."subjects" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      name text not null,
      code text,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, name)
    );

create table if not exists "draft_edu_v2"."audit_events" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      actor_user_id text references "draft_edu_v2"."auth_users" (id) on delete set null,
      actor_display_name text not null,
      actor_role text not null,
      event_type text not null,
      object_type text not null,
      object_id text not null,
      message text not null,
      reason text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

create table if not exists "draft_edu_v2"."notification_events" (
      id text primary key,
      event_type text not null,
      category text not null,
      title text not null,
      message text not null,
      href text not null,
      actor_name text,
      announcement_id text,
      class_id text,
      assignment_id text,
      submission_id text,
      created_at timestamptz not null default now()
    );

create table if not exists "draft_edu_v2"."notifications" (
      id text primary key,
      event_id text not null references "draft_edu_v2"."notification_events" (id) on delete cascade,
      recipient_role text not null,
      recipient_user_id text not null,
      read_at timestamptz,
      created_at timestamptz not null default now()
    );

create table if not exists "draft_edu_v2"."email_deliveries" (
      id text primary key,
      notification_id text references "draft_edu_v2"."notifications" (id) on delete set null,
      recipient_user_id text not null,
      recipient_email text,
      template_key text not null,
      locale text not null default 'en',
      status text not null default 'queued',
      provider_message_id text,
      last_error text,
      queued_at timestamptz not null default now(),
      sent_at timestamptz
    );

create index if not exists "idx_draft_edu_v2_audit_events_school_created"
      on "draft_edu_v2"."audit_events" (school_id, created_at desc, event_type, object_type, object_id);

create index if not exists "idx_draft_edu_v2_notifications_recipient_read"
      on "draft_edu_v2"."notifications" (recipient_role, recipient_user_id, read_at, created_at desc);

insert into "draft_edu_v2"."rostering_schema_migrations" (id) values ('202604270101_steck_core_schema_baseline') on conflict (id) do nothing;

-- Migration: 202604270102_rostering_module_tables
create table if not exists "draft_edu_v2"."rostering_schema_migrations" (
      id text primary key,
      applied_at timestamptz not null default now()
    );

create table if not exists "draft_edu_v2"."rostering_timetables" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      term_id text not null references "draft_edu_v2"."terms" (id) on delete cascade,
      name text not null,
      status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
      template_key text,
      template_version integer not null default 1,
      timezone text not null default 'Asia/Hong_Kong',
      default_period_minutes integer not null default 40 check (default_period_minutes > 0),
      am_period_indexes integer[] not null default '{1,2,3,4}',
      pm_period_indexes integer[] not null default '{5,6,7,8}',
      half_day_boundary_time time,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      published_at timestamptz,
      archived_at timestamptz,
      unique (school_id, term_id, name),
      check (published_at is null or status in ('published', 'archived')),
      check (half_day_boundary_time is not null or (cardinality(am_period_indexes) > 0 and cardinality(pm_period_indexes) > 0))
    );

alter table "draft_edu_v2"."rostering_timetables"
      alter column am_period_indexes set default '{1,2,3,4}';

alter table "draft_edu_v2"."rostering_timetables"
      alter column pm_period_indexes set default '{5,6,7,8}';

create table if not exists "draft_edu_v2"."rostering_timetable_periods" (
      id text primary key,
      timetable_id text not null references "draft_edu_v2"."rostering_timetables" (id) on delete cascade,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
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

create table if not exists "draft_edu_v2"."rostering_rooms" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
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

create table if not exists "draft_edu_v2"."rostering_equipment_resources" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      name text not null,
      resource_type text not null default 'equipment',
      quantity integer not null default 1 check (quantity > 0),
      status text not null default 'active' check (status in ('active', 'inactive')),
      metadata_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, name)
    );

create table if not exists "draft_edu_v2"."rostering_school_calendar_exceptions" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      term_id text references "draft_edu_v2"."terms" (id) on delete cascade,
      exception_date date not null,
      exception_type text not null check (exception_type in ('no_school', 'special_timetable', 'replacement_day')),
      replacement_day_index integer check (replacement_day_index is null or replacement_day_index between 1 and 7),
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, exception_date)
    );

create table if not exists "draft_edu_v2"."rostering_schedule_sessions" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      term_id text not null references "draft_edu_v2"."terms" (id) on delete cascade,
      timetable_id text not null references "draft_edu_v2"."rostering_timetables" (id) on delete cascade,
      timetable_period_id text not null references "draft_edu_v2"."rostering_timetable_periods" (id) on delete restrict,
      subject_id text not null references "draft_edu_v2"."subjects" (id) on delete restrict,
      grade_level_id text not null references "draft_edu_v2"."grade_levels" (id) on delete restrict,
      section text not null,
      room_id text references "draft_edu_v2"."rostering_rooms" (id) on delete restrict,
      assigned_teacher_id text references "draft_edu_v2"."teachers" (id) on delete restrict,
      status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'cancelled')),
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, term_id, timetable_period_id, grade_level_id, section, subject_id)
    );

create table if not exists "draft_edu_v2"."rostering_schedule_session_equipment_resources" (
      schedule_session_id text not null references "draft_edu_v2"."rostering_schedule_sessions" (id) on delete cascade,
      equipment_resource_id text not null references "draft_edu_v2"."rostering_equipment_resources" (id) on delete restrict,
      quantity integer not null default 1 check (quantity > 0),
      created_at timestamptz not null default now(),
      primary key (schedule_session_id, equipment_resource_id)
    );

create table if not exists "draft_edu_v2"."rostering_leave_requests" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      teacher_id text not null references "draft_edu_v2"."teachers" (id) on delete restrict,
      start_date date not null,
      end_date date not null,
      duration_type text not null check (duration_type in ('full_day', 'am_half_day', 'pm_half_day')),
      leave_type text not null,
      reason text,
      coverage_required boolean not null default true,
      substitute_notes text,
      status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
      reviewed_by text references "draft_edu_v2"."auth_users" (id) on delete restrict,
      reviewed_at timestamptz,
      created_by text not null references "draft_edu_v2"."auth_users" (id) on delete restrict,
      requested_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (start_date <= end_date),
      check ((status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null) or status in ('pending', 'cancelled'))
    );

create table if not exists "draft_edu_v2"."rostering_leave_session_impacts" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      leave_request_id text not null references "draft_edu_v2"."rostering_leave_requests" (id) on delete cascade,
      schedule_session_id text not null references "draft_edu_v2"."rostering_schedule_sessions" (id) on delete restrict,
      impact_date date not null,
      coverage_required boolean not null default true,
      coverage_status text not null default 'unfilled' check (coverage_status in ('unfilled', 'assigned', 'covered', 'no_coverage_needed', 'cancelled')),
      status text not null default 'active' check (status in ('active', 'inactive')),
      source text not null default 'system_computed' check (source in ('system_computed', 'admin_added', 'admin_removed')),
      warning_codes text[] not null default '{}',
      admin_adjustment_reason text,
      adjusted_by text references "draft_edu_v2"."auth_users" (id) on delete restrict,
      adjusted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (coverage_required or coverage_status = 'no_coverage_needed'),
      check ((source = 'system_computed' and admin_adjustment_reason is null) or (source <> 'system_computed')),
      check ((source in ('admin_added', 'admin_removed') and admin_adjustment_reason is not null and adjusted_by is not null and adjusted_at is not null) or source = 'system_computed')
    );

create table if not exists "draft_edu_v2"."rostering_substitute_rule_configs" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      criteria_key text not null,
      weight numeric(6,5) check (weight is null or (weight >= 0 and weight <= 1)),
      enabled boolean not null default true,
      custom_params jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      unique (school_id, criteria_key)
    );

create table if not exists "draft_edu_v2"."rostering_teacher_competencies" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      teacher_id text not null references "draft_edu_v2"."teachers" (id) on delete cascade,
      subject_id text not null references "draft_edu_v2"."subjects" (id) on delete cascade,
      level text not null check (level in ('primary', 'secondary', 'capable', 'same_department')),
      grade_band text,
      credential_key text,
      credential_verified boolean not null default false,
      updated_at timestamptz not null default now(),
      unique (school_id, teacher_id, subject_id)
    );

create table if not exists "draft_edu_v2"."rostering_teacher_class_familiarities" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      teacher_id text not null references "draft_edu_v2"."teachers" (id) on delete cascade,
      schedule_session_id text references "draft_edu_v2"."rostering_schedule_sessions" (id) on delete cascade,
      class_id text,
      subject_id text references "draft_edu_v2"."subjects" (id) on delete set null,
      grade_level_id text references "draft_edu_v2"."grade_levels" (id) on delete set null,
      section text,
      familiarity_score numeric(6,5) not null default 0 check (familiarity_score >= 0 and familiarity_score <= 1),
      last_taught_term_id text references "draft_edu_v2"."terms" (id) on delete set null,
      updated_at timestamptz not null default now(),
      check (schedule_session_id is not null or class_id is not null or (subject_id is not null and grade_level_id is not null and section is not null))
    );

create table if not exists "draft_edu_v2"."rostering_substitute_availabilities" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      teacher_id text not null references "draft_edu_v2"."teachers" (id) on delete cascade,
      date date not null,
      timetable_period_id text references "draft_edu_v2"."rostering_timetable_periods" (id) on delete cascade,
      availability_status text not null check (availability_status in ('available', 'unavailable', 'limited')),
      reason text,
      updated_by text not null references "draft_edu_v2"."auth_users" (id) on delete restrict,
      updated_at timestamptz not null default now(),
      unique (school_id, teacher_id, date, timetable_period_id)
    );

create table if not exists "draft_edu_v2"."rostering_substitute_assignments" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      leave_request_id text not null references "draft_edu_v2"."rostering_leave_requests" (id) on delete cascade,
      schedule_session_id text not null references "draft_edu_v2"."rostering_schedule_sessions" (id) on delete restrict,
      original_teacher_id text not null references "draft_edu_v2"."teachers" (id) on delete restrict,
      substitute_teacher_id text not null references "draft_edu_v2"."teachers" (id) on delete restrict,
      assigned_by text references "draft_edu_v2"."auth_users" (id) on delete restrict,
      assigned_at timestamptz not null default now(),
      status text not null default 'assigned' check (status in ('unfilled', 'assigned', 'offered', 'acknowledged', 'accepted', 'declined', 'completed', 'canceled')),
      acknowledged_at timestamptz,
      accepted_at timestamptz,
      declined_at timestamptz,
      completed_at timestamptz,
      canceled_at timestamptz,
      cancellation_reason text
    );

create table if not exists "draft_edu_v2"."rostering_substitute_preference_rules" (
      id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      substitute_teacher_id text not null references "draft_edu_v2"."teachers" (id) on delete cascade,
      scope text not null check (scope in ('schedule_session', 'original_teacher', 'subject_grade', 'subject', 'teacher', 'school')),
      preference_type text not null check (preference_type in ('preferred', 'soft_avoid', 'hard_exclusion')),
      weight numeric(6,5) check (weight is null or (weight >= 0 and weight <= 1)),
      schedule_session_id text references "draft_edu_v2"."rostering_schedule_sessions" (id) on delete cascade,
      original_teacher_id text references "draft_edu_v2"."teachers" (id) on delete cascade,
      subject_id text references "draft_edu_v2"."subjects" (id) on delete cascade,
      grade_level_id text references "draft_edu_v2"."grade_levels" (id) on delete cascade,
      reason text,
      enabled boolean not null default true,
      updated_by text not null references "draft_edu_v2"."auth_users" (id) on delete restrict,
      updated_at timestamptz not null default now(),
      check (
        (scope = 'schedule_session' and schedule_session_id is not null) or
        (scope = 'original_teacher' and original_teacher_id is not null) or
        (scope = 'subject_grade' and subject_id is not null and grade_level_id is not null) or
        (scope = 'subject' and subject_id is not null) or
        (scope in ('teacher', 'school'))
      )
    );

create table if not exists "draft_edu_v2"."rostering_recommendation_jobs" (
      job_id text primary key,
      school_id text not null references "draft_edu_v2"."schools" (id) on delete cascade,
      leave_id text not null references "draft_edu_v2"."rostering_leave_requests" (id) on delete cascade,
      session_id text not null references "draft_edu_v2"."rostering_schedule_sessions" (id) on delete cascade,
      rule_config_version text not null default 'v1',
      status text not null check (status in ('queued', 'running', 'completed', 'failed')),
      current_step text not null,
      progress numeric(5,4) not null default 0 check (progress >= 0 and progress <= 1),
      result_json jsonb,
      error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (school_id, leave_id, session_id, rule_config_version)
    );

create index if not exists rostering_timetables_school_term_idx on "draft_edu_v2"."rostering_timetables" (school_id, term_id);

create index if not exists rostering_timetables_status_idx on "draft_edu_v2"."rostering_timetables" (school_id, status);

create index if not exists rostering_timetable_periods_lookup_idx on "draft_edu_v2"."rostering_timetable_periods" (school_id, timetable_id, day_index, period_index);

create index if not exists rostering_timetable_periods_half_day_idx on "draft_edu_v2"."rostering_timetable_periods" (timetable_id, half_day, day_index, period_index);

create unique index if not exists rostering_schedule_sessions_teacher_period_active_idx
      on "draft_edu_v2"."rostering_schedule_sessions" (school_id, term_id, assigned_teacher_id, timetable_period_id)
      where assigned_teacher_id is not null and status in ('draft', 'published');

create unique index if not exists rostering_schedule_sessions_room_period_active_idx
      on "draft_edu_v2"."rostering_schedule_sessions" (school_id, term_id, room_id, timetable_period_id)
      where room_id is not null and status in ('draft', 'published');

create index if not exists rostering_schedule_sessions_timetable_idx on "draft_edu_v2"."rostering_schedule_sessions" (school_id, timetable_id, timetable_period_id);

create index if not exists rostering_schedule_sessions_teacher_idx on "draft_edu_v2"."rostering_schedule_sessions" (school_id, term_id, assigned_teacher_id);

create index if not exists rostering_schedule_sessions_class_idx on "draft_edu_v2"."rostering_schedule_sessions" (school_id, term_id, grade_level_id, section);

create index if not exists rostering_rooms_school_status_idx on "draft_edu_v2"."rostering_rooms" (school_id, status);

create index if not exists rostering_equipment_resources_school_status_idx on "draft_edu_v2"."rostering_equipment_resources" (school_id, status);

create index if not exists rostering_calendar_exceptions_school_term_date_idx on "draft_edu_v2"."rostering_school_calendar_exceptions" (school_id, term_id, exception_date);

create index if not exists rostering_leave_requests_school_status_idx on "draft_edu_v2"."rostering_leave_requests" (school_id, status, start_date, end_date);

create index if not exists rostering_leave_requests_teacher_date_idx on "draft_edu_v2"."rostering_leave_requests" (school_id, teacher_id, start_date, end_date);

create index if not exists rostering_leave_requests_duration_idx on "draft_edu_v2"."rostering_leave_requests" (school_id, duration_type);

create index if not exists rostering_leave_session_impacts_leave_idx on "draft_edu_v2"."rostering_leave_session_impacts" (leave_request_id, status);

create index if not exists rostering_leave_session_impacts_session_date_idx on "draft_edu_v2"."rostering_leave_session_impacts" (school_id, schedule_session_id, impact_date);

create index if not exists rostering_leave_session_impacts_coverage_idx
      on "draft_edu_v2"."rostering_leave_session_impacts" (school_id, coverage_status, coverage_required)
      where status = 'active';

create unique index if not exists rostering_leave_session_impacts_active_unique_idx
      on "draft_edu_v2"."rostering_leave_session_impacts" (leave_request_id, schedule_session_id, impact_date)
      where status = 'active';

create index if not exists rostering_substitute_rule_configs_school_idx on "draft_edu_v2"."rostering_substitute_rule_configs" (school_id, enabled, criteria_key);

create index if not exists rostering_teacher_competencies_lookup_idx on "draft_edu_v2"."rostering_teacher_competencies" (school_id, subject_id, level, teacher_id);

create index if not exists rostering_teacher_competencies_teacher_idx on "draft_edu_v2"."rostering_teacher_competencies" (school_id, teacher_id);

create unique index if not exists rostering_teacher_familiarities_session_unique_idx
      on "draft_edu_v2"."rostering_teacher_class_familiarities" (school_id, teacher_id, schedule_session_id)
      where schedule_session_id is not null;

create unique index if not exists rostering_teacher_familiarities_class_unique_idx
      on "draft_edu_v2"."rostering_teacher_class_familiarities" (school_id, teacher_id, class_id)
      where schedule_session_id is null and class_id is not null;

create unique index if not exists rostering_teacher_familiarities_subject_section_unique_idx
      on "draft_edu_v2"."rostering_teacher_class_familiarities" (school_id, teacher_id, subject_id, grade_level_id, section)
      where schedule_session_id is null and class_id is null;

create index if not exists rostering_teacher_familiarities_lookup_idx
      on "draft_edu_v2"."rostering_teacher_class_familiarities" (school_id, schedule_session_id, subject_id, grade_level_id, section);

create index if not exists rostering_substitute_availabilities_lookup_idx
      on "draft_edu_v2"."rostering_substitute_availabilities" (school_id, teacher_id, date, timetable_period_id, availability_status);

create index if not exists rostering_substitute_availabilities_date_idx
      on "draft_edu_v2"."rostering_substitute_availabilities" (school_id, date, timetable_period_id, availability_status);

create unique index if not exists rostering_substitute_assignments_active_teacher_period_idx
      on "draft_edu_v2"."rostering_substitute_assignments" (school_id, substitute_teacher_id, schedule_session_id)
      where status in ('assigned', 'offered', 'acknowledged', 'accepted');

create index if not exists rostering_substitute_assignments_teacher_status_idx
      on "draft_edu_v2"."rostering_substitute_assignments" (school_id, substitute_teacher_id, status, assigned_at);

create index if not exists rostering_substitute_preference_rules_lookup_idx
      on "draft_edu_v2"."rostering_substitute_preference_rules" (school_id, enabled, substitute_teacher_id, scope, preference_type);

create index if not exists rostering_substitute_preference_rules_context_idx
      on "draft_edu_v2"."rostering_substitute_preference_rules" (school_id, schedule_session_id, original_teacher_id, subject_id, grade_level_id)
      where enabled = true;

create index if not exists rostering_recommendation_jobs_lookup_idx
      on "draft_edu_v2"."rostering_recommendation_jobs" (school_id, leave_id, session_id, status, updated_at desc);

insert into "draft_edu_v2"."rostering_schema_migrations" (id) values ('202604270102_rostering_module_tables') on conflict (id) do nothing;

commit;


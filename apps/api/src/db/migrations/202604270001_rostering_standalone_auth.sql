-- TASK-057: standalone school-scoped auth foundation for the roster MVP.
-- Apply this before roster timetable migrations.

-- migrate:up
create table if not exists roster_schools (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roster_users (
  id text primary key,
  school_id text not null references roster_schools(id) on delete restrict,
  email text not null,
  display_name text not null,
  preferred_locale text,
  status text not null check (status in ('active', 'suspended')),
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, email)
);

create table if not exists roster_user_roles (
  user_id text not null references roster_users(id) on delete cascade,
  role text not null check (role in ('school_admin', 'teacher', 'support')),
  actor_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists roster_auth_sessions (
  id text primary key,
  user_id text not null references roster_users(id) on delete cascade,
  active_school_id text not null references roster_schools(id) on delete restrict,
  active_role text not null check (active_role in ('school_admin', 'teacher', 'support')),
  session_token_hash text not null unique,
  csrf_token_hash text not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists roster_users_school_status_idx on roster_users (school_id, status);
create index if not exists roster_auth_sessions_user_idx on roster_auth_sessions (user_id, expires_at);
create index if not exists roster_auth_sessions_active_idx on roster_auth_sessions (active_school_id, active_role) where revoked_at is null;

-- migrate:down
drop table if exists roster_auth_sessions;
drop table if exists roster_user_roles;
drop table if exists roster_users;
drop table if exists roster_schools;

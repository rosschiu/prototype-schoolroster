import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPostgresDatabase } from '../../../src/db/postgres.js';
import { rosterFoundationMigrations } from '../../../src/rostering/db/migration-files.js';
import { buildRosteringMigrations, migrateRosteringDatabase } from '../../../src/rostering/db/migrations.js';

const schema = 'draft_edu_v2';

function allMigrationSql(): string {
  return buildRosteringMigrations(schema)
    .flatMap((migration) => migration.statements)
    .join('\n');
}

test('migration metadata exposes Steck core and rostering-owned tables only', () => {
  const tables = rosterFoundationMigrations.flatMap((migration) => migration.requiredTables);

  for (const steckTable of [
    'schools',
    'teachers',
    'auth_users',
    'school_memberships',
    'role_assignments',
    'auth_sessions',
    'academic_years',
    'terms',
    'grade_levels',
    'subjects',
    'audit_events',
    'notification_events',
    'notifications',
    'email_deliveries'
  ]) {
    assert.ok(tables.includes(steckTable), `missing Steck table ${steckTable}`);
  }

  for (const rosteringTable of [
    'rostering_timetables',
    'rostering_timetable_periods',
    'rostering_schedule_sessions',
    'rostering_leave_requests',
    'rostering_leave_session_impacts',
    'rostering_substitute_rule_configs',
    'rostering_teacher_competencies',
    'rostering_teacher_class_familiarities',
    'rostering_substitute_availabilities',
    'rostering_substitute_assignments',
    'rostering_substitute_preference_rules',
    'rostering_recommendation_jobs'
  ]) {
    assert.ok(tables.includes(rosteringTable), `missing rostering table ${rosteringTable}`);
  }

  for (const forbiddenTable of [
    'roster_schools',
    'roster_users',
    'roster_user_roles',
    'roster_auth_sessions',
    'roster_terms',
    'roster_class_sessions',
    'roster_audit_events'
  ]) {
    assert.ok(!tables.includes(forbiddenTable), `metadata still references forbidden table ${forbiddenTable}`);
  }
});

test('Steck-compatible migration SQL reuses existing core table names', () => {
  const sql = allMigrationSql();

  for (const table of ['schools', 'teachers', 'auth_users', 'school_memberships', 'role_assignments', 'auth_sessions']) {
    assert.match(sql, new RegExp(`create table if not exists "draft_edu_v2"\\."${table}"`));
  }

  assert.match(sql, /create table if not exists "draft_edu_v2"\."audit_events"/);
  assert.match(sql, /create table if not exists "draft_edu_v2"\."notification_events"/);
  assert.match(sql, /create table if not exists "draft_edu_v2"\."notifications"/);
  assert.match(sql, /actor_user_id text references "draft_edu_v2"\."auth_users"/);
  assert.match(sql, /school_id text not null references "draft_edu_v2"\."schools"/);
});

test('rostering migrations create module-owned tables with Steck foreign keys', () => {
  const sql = allMigrationSql();

  for (const table of [
    'rostering_timetables',
    'rostering_timetable_periods',
    'rostering_rooms',
    'rostering_equipment_resources',
    'rostering_school_calendar_exceptions',
    'rostering_schedule_sessions',
    'rostering_schedule_session_equipment_resources',
    'rostering_leave_requests',
    'rostering_leave_session_impacts',
    'rostering_substitute_rule_configs',
    'rostering_teacher_competencies',
    'rostering_teacher_class_familiarities',
    'rostering_substitute_availabilities',
    'rostering_substitute_assignments',
    'rostering_substitute_preference_rules',
    'rostering_recommendation_jobs'
  ]) {
    assert.match(sql, new RegExp(`create table if not exists "draft_edu_v2"\\."${table}"`));
  }

  assert.match(sql, /term_id text not null references "draft_edu_v2"\."terms" \(id\)/);
  assert.match(sql, /subject_id text not null references "draft_edu_v2"\."subjects" \(id\)/);
  assert.match(sql, /grade_level_id text not null references "draft_edu_v2"\."grade_levels" \(id\)/);
  assert.match(sql, /assigned_teacher_id text references "draft_edu_v2"\."teachers" \(id\)/);
  assert.match(sql, /teacher_id text not null references "draft_edu_v2"\."teachers" \(id\)/);
  assert.match(sql, /created_by text not null references "draft_edu_v2"\."auth_users" \(id\)/);
  assert.match(sql, /reviewed_by text references "draft_edu_v2"\."auth_users" \(id\)/);
  assert.match(sql, /adjusted_by text references "draft_edu_v2"\."auth_users" \(id\)/);
  assert.match(sql, /unique \(school_id, criteria_key\)/);
  assert.match(sql, /unique \(school_id, teacher_id, subject_id\)/);
  assert.match(sql, /teacher_id text not null references "draft_edu_v2"\."teachers" \(id\) on delete cascade/);
  assert.match(sql, /subject_id text not null references "draft_edu_v2"\."subjects" \(id\) on delete cascade/);
  assert.match(sql, /last_taught_term_id text references "draft_edu_v2"\."terms" \(id\)/);
  assert.match(sql, /rostering_substitute_rule_configs_school_idx/);
  assert.match(sql, /rostering_teacher_competencies_lookup_idx/);
  assert.match(sql, /rostering_teacher_familiarities_lookup_idx/);
  assert.match(sql, /rostering_substitute_availabilities_lookup_idx/);
  assert.match(sql, /rostering_substitute_assignments_teacher_status_idx/);
  assert.match(sql, /rostering_substitute_preference_rules_lookup_idx/);
  assert.match(sql, /rostering_recommendation_jobs_lookup_idx/);
});

test('rostering schema avoids prototype-only roster core tables and class_sessions overload', () => {
  const sql = allMigrationSql();

  for (const forbidden of [
    'roster_schools',
    'roster_users',
    'roster_user_roles',
    'roster_auth_sessions',
    'roster_terms',
    'roster_class_sessions',
    'roster_audit_events',
    'create table if not exists "draft_edu_v2"."class_sessions"'
  ]) {
    assert.ok(!sql.includes(forbidden), `migration SQL must not include ${forbidden}`);
  }

  assert.match(sql, /create table if not exists "draft_edu_v2"\."rostering_schedule_sessions"/);
  assert.match(sql, /rostering_schedule_sessions_teacher_period_active_idx/);
  assert.match(sql, /rostering_leave_session_impacts_active_unique_idx/);
});

test('migration runner applies schema to PostgreSQL when DATABASE_URL is available', async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip('DATABASE_URL is not set; static migration compatibility tests still run.');
    return;
  }

  const testSchema = `rostering_test_${randomUUID().replaceAll('-', '_')}`;
  const database = createPostgresDatabase(databaseUrl);
  try {
    await migrateRosteringDatabase(database, testSchema);

    const result = await database.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = $1
       order by table_name`,
      [testSchema]
    );
    const tables = result.rows.map((row) => row.table_name);

    assert.ok(tables.includes('schools'));
    assert.ok(tables.includes('auth_users'));
    assert.ok(tables.includes('teachers'));
    assert.ok(tables.includes('rostering_timetables'));
    assert.ok(tables.includes('rostering_schedule_sessions'));
    assert.ok(tables.includes('rostering_leave_requests'));
    assert.ok(tables.includes('rostering_substitute_rule_configs'));
    assert.ok(tables.includes('rostering_teacher_competencies'));
    assert.ok(tables.includes('rostering_teacher_class_familiarities'));
    assert.ok(tables.includes('rostering_substitute_availabilities'));
    assert.ok(tables.includes('rostering_substitute_assignments'));
    assert.ok(tables.includes('rostering_substitute_preference_rules'));
    assert.ok(tables.includes('rostering_recommendation_jobs'));
    assert.ok(!tables.includes('roster_users'));
    assert.ok(!tables.includes('roster_class_sessions'));

    const ledger = await database.query<{ id: string }>(
      `select id from "${testSchema}"."rostering_schema_migrations" order by id`
    );
    assert.deepEqual(
      ledger.rows.map((row) => row.id),
      ['202604270101_steck_core_schema_baseline', '202604270102_rostering_module_tables']
    );
  } finally {
    await database.query(`drop schema if exists "${testSchema}" cascade`);
    await database.close();
  }
});

import type { PostgresDatabase } from '../../db/postgres.js';
import { tableRef } from './schema.js';

export async function seedPostgresRosteringReferenceData(input: {
  database: PostgresDatabase;
  schema: string;
}): Promise<void> {
  await input.database.query('begin');
  try {
    await input.database.query(
      `insert into ${tableRef(input.schema, 'academic_years')} (id, school_id, name, starts_on, ends_on, active)
       values ($1, $2, $3, $4::date, $5::date, true)
       on conflict (school_id, name) do update set
         starts_on = excluded.starts_on,
         ends_on = excluded.ends_on,
         active = excluded.active,
         updated_at = now()`,
      ['ay-2026', 'school-steck-demo', '2026', '2026-01-01', '2026-12-31']
    );
    await input.database.query(
      `insert into ${tableRef(input.schema, 'terms')} (id, school_id, academic_year_id, name, starts_on, ends_on, active)
       values ($1, $2, $3, $4, $5::date, $6::date, true)
       on conflict (school_id, academic_year_id, name) do update set
         starts_on = excluded.starts_on,
         ends_on = excluded.ends_on,
         active = excluded.active,
         updated_at = now()`,
      ['term-2026-t1', 'school-steck-demo', 'ay-2026', 'Term 1', '2026-01-01', '2026-06-30']
    );

    for (const [id, label, shortLabel, sortOrder] of [
      ['p4', 'Primary 4', 'P4', 4],
      ['p5', 'Primary 5', 'P5', 5],
      ['P4', 'Primary 4 UI Alias', 'P4', 4],
      ['P5', 'Primary 5 UI Alias', 'P5', 5],
      ['P6', 'Primary 6 UI Alias', 'P6', 6]
    ] as const) {
      await input.database.query(
        `insert into ${tableRef(input.schema, 'grade_levels')} (id, school_id, label, short_label, sort_order)
         values ($1, $2, $3, $4, $5)
         on conflict (school_id, label) do update set
           short_label = excluded.short_label,
           sort_order = excluded.sort_order,
           active = true,
           updated_at = now()`,
        [id, 'school-steck-demo', label, shortLabel, sortOrder]
      );
    }

    for (const [id, name, code] of [
      ['subject-math', 'Mathematics', 'MATH'],
      ['subject-english', 'English', 'ENG'],
      ['Math', 'Math UI Alias', 'MATH'],
      ['Science', 'Science UI Alias', 'SCI'],
      ['English', 'English UI Alias', 'ENG'],
      ['PE', 'PE UI Alias', 'PE']
    ] as const) {
      await input.database.query(
        `insert into ${tableRef(input.schema, 'subjects')} (id, school_id, name, code)
         values ($1, $2, $3, $4)
         on conflict (school_id, name) do update set
           code = excluded.code,
           active = true,
           updated_at = now()`,
        [id, 'school-steck-demo', name, code]
      );
    }

    for (const [id, name, roomCode] of [
      ['room-101', 'Room 101', '101'],
      ['room-102', 'Room 102', '102']
    ] as const) {
      await input.database.query(
        `insert into ${tableRef(input.schema, 'rostering_rooms')} (id, school_id, name, room_code, status)
         values ($1, $2, $3, $4, 'active')
         on conflict (id) do update set
           name = excluded.name,
           room_code = excluded.room_code,
           status = excluded.status,
           updated_at = now()`,
        [id, 'school-steck-demo', name, roomCode]
      );
    }

    await input.database.query(
      `insert into ${tableRef(input.schema, 'rostering_equipment_resources')} (id, school_id, name, resource_type, quantity, status)
       values ($1, $2, $3, $4, $5, 'active')
       on conflict (id) do update set
         name = excluded.name,
         resource_type = excluded.resource_type,
         quantity = excluded.quantity,
         status = excluded.status,
         updated_at = now()`,
      ['projector-1', 'school-steck-demo', 'Projector 1', 'equipment', 1]
    );

    for (const [criteriaKey, weight, enabled, customParams] of [
      ['workload_balance', 0.3, true, { target_distribution: 'mean', week_pressure_weight: 0.5 }],
      [
        'subject_competency',
        0.35,
        true,
        { primary: 1, secondary: 0.75, capable: 0.45, same_department: 0.3, none: 0 }
      ],
      ['class_familiarity', 0.2, true, { decay_half_life_terms: 3 }],
      ['recency_penalty', 0.15, true, { window_days: 14, shape: 'linear' }],
      [
        'preference_policy',
        0.1,
        true,
        {
          neutral: 0.5,
          preferred_boost: 0.3,
          soft_penalty: 0.3,
          scopes: ['schedule_session', 'original_teacher', 'subject_grade', 'subject', 'teacher', 'school']
        }
      ],
      ['weekly_substitute_cap', null, true, { max_per_week: 5 }],
      ['hard_constraints', null, true, { require_competency: false, require_availability: true }],
      ['exclusion', null, true, { teacher_ids: [], subject_ids: [], grade_level_ids: [] }]
    ] as const) {
      await input.database.query(
        `insert into ${tableRef(input.schema, 'rostering_substitute_rule_configs')}
           (id, school_id, criteria_key, weight, enabled, custom_params)
         values ($1, $2, $3, $4, $5, $6::jsonb)
         on conflict (school_id, criteria_key) do update set
           weight = excluded.weight,
           enabled = excluded.enabled,
           custom_params = excluded.custom_params,
           updated_at = now()`,
        [
          `rule-school-steck-demo-${criteriaKey}`,
          'school-steck-demo',
          criteriaKey,
          weight,
          enabled,
          JSON.stringify(customParams)
        ]
      );
    }

    await input.database.query('commit');
  } catch (error) {
    await input.database.query('rollback');
    throw error;
  }
}

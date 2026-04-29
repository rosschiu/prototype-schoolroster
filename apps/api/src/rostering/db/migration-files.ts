export type RosterMigration = {
  id: string;
  path?: string;
  requiredTables: string[];
  requiredIndexes: string[];
};

export const rosterFoundationMigrations: RosterMigration[] = [
  {
    id: '202604270101_steck_core_schema_baseline',
    requiredTables: [
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
    ],
    requiredIndexes: [
      'idx_draft_edu_v2_audit_events_school_created',
      'idx_draft_edu_v2_notifications_recipient_read'
    ]
  },
  {
    id: '202604270102_rostering_module_tables',
    requiredTables: [
      'rostering_schema_migrations',
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
    ],
    requiredIndexes: [
      'rostering_timetables_school_term_idx',
      'rostering_timetable_periods_lookup_idx',
      'rostering_schedule_sessions_teacher_period_active_idx',
      'rostering_schedule_sessions_room_period_active_idx',
      'rostering_leave_requests_teacher_date_idx',
      'rostering_leave_session_impacts_active_unique_idx',
      'rostering_substitute_rule_configs_school_idx',
      'rostering_teacher_competencies_lookup_idx',
      'rostering_teacher_familiarities_lookup_idx',
      'rostering_substitute_availabilities_lookup_idx',
      'rostering_substitute_assignments_teacher_status_idx',
      'rostering_substitute_preference_rules_lookup_idx',
      'rostering_recommendation_jobs_lookup_idx'
    ]
  }
];

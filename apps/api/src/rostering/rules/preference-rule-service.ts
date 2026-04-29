import { randomUUID } from 'node:crypto';
import type {
  PatchSubstitutePreferenceRulesRequest,
  SubstitutePreferenceRule,
  SubstitutePreferenceRuleScope,
  SubstitutePreferenceRuleType
} from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';
import { TimetableValidationError, type TimetableRepository } from '../timetable/timetable-service.js';

export type PreferenceRuleRepository = {
  list(schoolId: string): Promise<SubstitutePreferenceRule[]>;
  upsert(rules: SubstitutePreferenceRule[]): Promise<SubstitutePreferenceRule[]>;
  delete(input: { schoolId: string; ruleIds: string[] }): Promise<void>;
};

type PreferenceRuleRow = {
  id: string;
  school_id: string;
  substitute_teacher_id: string;
  scope: SubstitutePreferenceRuleScope;
  preference_type: SubstitutePreferenceRuleType;
  weight: string | null;
  schedule_session_id: string | null;
  original_teacher_id: string | null;
  subject_id: string | null;
  grade_level_id: string | null;
  reason: string | null;
  enabled: boolean;
  updated_by: string;
  updated_at: string;
};

const scopes = ['schedule_session', 'original_teacher', 'subject_grade', 'subject', 'teacher', 'school'];
const preferenceTypes = ['preferred', 'soft_avoid', 'hard_exclusion'];

export class InMemoryPreferenceRuleRepository implements PreferenceRuleRepository {
  private readonly records = new Map<string, SubstitutePreferenceRule>();

  constructor(initialRules: SubstitutePreferenceRule[] = []) {
    for (const rule of initialRules) this.records.set(rule.id, rule);
  }

  async list(schoolId: string): Promise<SubstitutePreferenceRule[]> {
    return [...this.records.values()]
      .filter((rule) => rule.schoolId === schoolId)
      .sort(sortPreferenceRules);
  }

  async upsert(rules: SubstitutePreferenceRule[]): Promise<SubstitutePreferenceRule[]> {
    for (const rule of rules) this.records.set(rule.id, rule);
    return rules;
  }

  async delete({ schoolId, ruleIds }: { schoolId: string; ruleIds: string[] }): Promise<void> {
    const ids = new Set(ruleIds);
    for (const [id, rule] of this.records) {
      if (rule.schoolId === schoolId && ids.has(id)) this.records.delete(id);
    }
  }
}

export class PostgresPreferenceRuleRepository implements PreferenceRuleRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async list(schoolId: string): Promise<SubstitutePreferenceRule[]> {
    const result = await this.database.query<PreferenceRuleRow>(
      `select id, school_id, substitute_teacher_id, scope, preference_type, weight::text, schedule_session_id,
              original_teacher_id, subject_id, grade_level_id, reason, enabled, updated_by, updated_at::text
       from ${tableRef(this.schema, 'rostering_substitute_preference_rules')}
       where school_id = $1
       order by enabled desc, scope, preference_type, substitute_teacher_id, id`,
      [schoolId]
    );
    return result.rows.map(toPreferenceRule);
  }

  async upsert(rules: SubstitutePreferenceRule[]): Promise<SubstitutePreferenceRule[]> {
    const saved: SubstitutePreferenceRule[] = [];
    for (const rule of rules) {
      const result = await this.database.query<PreferenceRuleRow>(
        `insert into ${tableRef(this.schema, 'rostering_substitute_preference_rules')} (
           id, school_id, substitute_teacher_id, scope, preference_type, weight, schedule_session_id,
           original_teacher_id, subject_id, grade_level_id, reason, enabled, updated_by, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict (id) do update set
           substitute_teacher_id = excluded.substitute_teacher_id,
           scope = excluded.scope,
           preference_type = excluded.preference_type,
           weight = excluded.weight,
           schedule_session_id = excluded.schedule_session_id,
           original_teacher_id = excluded.original_teacher_id,
           subject_id = excluded.subject_id,
           grade_level_id = excluded.grade_level_id,
           reason = excluded.reason,
           enabled = excluded.enabled,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at
         returning id, school_id, substitute_teacher_id, scope, preference_type, weight::text, schedule_session_id,
                   original_teacher_id, subject_id, grade_level_id, reason, enabled, updated_by, updated_at::text`,
        [
          rule.id,
          rule.schoolId,
          rule.substituteTeacherId,
          rule.scope,
          rule.preferenceType,
          rule.weight ?? null,
          rule.scheduleSessionId ?? null,
          rule.originalTeacherId ?? null,
          rule.subjectId ?? null,
          rule.gradeLevelId ?? null,
          rule.reason ?? null,
          rule.enabled,
          rule.updatedBy,
          rule.updatedAt
        ]
      );
      saved.push(toPreferenceRule(result.rows[0]));
    }
    return saved;
  }

  async delete({ schoolId, ruleIds }: { schoolId: string; ruleIds: string[] }): Promise<void> {
    if (!ruleIds.length) return;
    await this.database.query(
      `delete from ${tableRef(this.schema, 'rostering_substitute_preference_rules')}
       where school_id = $1 and id = any($2::text[])`,
      [schoolId, ruleIds]
    );
  }
}

export function createPreferenceRuleService(input: {
  repository: PreferenceRuleRepository;
  timetableRepository: TimetableRepository;
}) {
  async function list({ session, schoolId }: { session: AuthenticatedRosterSession; schoolId: string }) {
    assertAdmin(session, schoolId);
    return input.repository.list(schoolId);
  }

  async function patch({
    session,
    request
  }: {
    session: AuthenticatedRosterSession;
    request: PatchSubstitutePreferenceRulesRequest;
  }) {
    assertAdmin(session, request.schoolId);
    const before = await input.repository.list(request.schoolId);
    const updatedAt = new Date().toISOString();
    const toSave = request.rules.map((rule) => normalizeRule({ schoolId: request.schoolId, actorUserId: session.user.userId, updatedAt, rule }));
    await input.repository.delete({ schoolId: request.schoolId, ruleIds: request.deleteRuleIds ?? [] });
    const saved = await input.repository.upsert(toSave);
    const after = await input.repository.list(request.schoolId);
    await input.timetableRepository.appendAudit({
      id: randomUUID(),
      schoolId: request.schoolId,
      actorUserId: session.user.userId,
      actorRole: session.activeRole,
      action: 'substitute_preference_rules.patch',
      entityType: 'substitute_preference_rule',
      entityId: request.schoolId,
      before,
      after,
      createdAt: updatedAt
    });
    return saved;
  }

  return { list, patch };
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin' || session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Only school admins can manage substitute preference rules for their own school.');
  }
}

function normalizeRule(input: {
  schoolId: string;
  actorUserId: string;
  updatedAt: string;
  rule: PatchSubstitutePreferenceRulesRequest['rules'][number];
}): SubstitutePreferenceRule {
  if (!input.rule.substituteTeacherId.trim()) {
    throw new TimetableValidationError('substituteTeacherId is required.');
  }
  if (!scopes.includes(input.rule.scope)) {
    throw new TimetableValidationError('Preference rule scope is not supported.');
  }
  if (!preferenceTypes.includes(input.rule.preferenceType)) {
    throw new TimetableValidationError('Preference rule type is not supported.');
  }
  if (input.rule.weight !== null && input.rule.weight !== undefined && (input.rule.weight < 0 || input.rule.weight > 1)) {
    throw new TimetableValidationError('Preference rule weight must be between 0 and 1.');
  }
  assertScopeFields(input.rule);
  return {
    id: input.rule.id ?? `preference-rule-${randomUUID()}`,
    schoolId: input.schoolId,
    substituteTeacherId: input.rule.substituteTeacherId.trim(),
    scope: input.rule.scope,
    preferenceType: input.rule.preferenceType,
    weight: input.rule.weight ?? null,
    scheduleSessionId: input.rule.scheduleSessionId,
    originalTeacherId: input.rule.originalTeacherId,
    subjectId: input.rule.subjectId,
    gradeLevelId: input.rule.gradeLevelId,
    reason: input.rule.reason?.trim() || undefined,
    enabled: input.rule.enabled ?? true,
    updatedBy: input.actorUserId,
    updatedAt: input.updatedAt
  };
}

function assertScopeFields(rule: PatchSubstitutePreferenceRulesRequest['rules'][number]): void {
  if (rule.scope === 'schedule_session' && !rule.scheduleSessionId) throw new TimetableValidationError('scheduleSessionId is required for schedule_session preference rules.');
  if (rule.scope === 'original_teacher' && !rule.originalTeacherId) throw new TimetableValidationError('originalTeacherId is required for original_teacher preference rules.');
  if (rule.scope === 'subject_grade' && (!rule.subjectId || !rule.gradeLevelId)) throw new TimetableValidationError('subjectId and gradeLevelId are required for subject_grade preference rules.');
  if (rule.scope === 'subject' && !rule.subjectId) throw new TimetableValidationError('subjectId is required for subject preference rules.');
}

function sortPreferenceRules(left: SubstitutePreferenceRule, right: SubstitutePreferenceRule): number {
  return Number(right.enabled) - Number(left.enabled)
    || left.scope.localeCompare(right.scope)
    || left.preferenceType.localeCompare(right.preferenceType)
    || left.substituteTeacherId.localeCompare(right.substituteTeacherId)
    || left.id.localeCompare(right.id);
}

function toPreferenceRule(row: PreferenceRuleRow): SubstitutePreferenceRule {
  return {
    id: row.id,
    schoolId: row.school_id,
    substituteTeacherId: row.substitute_teacher_id,
    scope: row.scope,
    preferenceType: row.preference_type,
    weight: row.weight === null ? null : Number(row.weight),
    scheduleSessionId: row.schedule_session_id ?? undefined,
    originalTeacherId: row.original_teacher_id ?? undefined,
    subjectId: row.subject_id ?? undefined,
    gradeLevelId: row.grade_level_id ?? undefined,
    reason: row.reason ?? undefined,
    enabled: row.enabled,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}


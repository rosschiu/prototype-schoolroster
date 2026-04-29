import { randomUUID } from 'node:crypto';
import type {
  PatchSubstituteRuleConfigRequest,
  SubstituteRuleConfig,
  SubstituteRuleCriteriaKey
} from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';
import { TimetableValidationError, type TimetableRepository } from '../timetable/timetable-service.js';
import type { RuleWeightConfig } from '../substitute-matching/scoring.js';

export type RuleConfigRepository = {
  list(schoolId: string): Promise<SubstituteRuleConfig[]>;
  upsert(rules: SubstituteRuleConfig[]): Promise<SubstituteRuleConfig[]>;
  listRuleWeights(schoolId: string): Promise<RuleWeightConfig[]>;
};

type RuleConfigRow = {
  id: string;
  school_id: string;
  criteria_key: SubstituteRuleCriteriaKey;
  weight: string | null;
  enabled: boolean;
  custom_params: Record<string, unknown>;
  updated_at: string;
};

const scoringCriteria = ['workload_balance', 'subject_competency', 'class_familiarity', 'recency_penalty', 'preference_policy'] as const;
const hardCriteria = ['weekly_substitute_cap', 'hard_constraints', 'exclusion'] as const;
const allCriteria = [...scoringCriteria, ...hardCriteria] as const;

export function defaultRuleConfigs(schoolId: string): SubstituteRuleConfig[] {
  const updatedAt = new Date().toISOString();
  const rules: Array<Omit<SubstituteRuleConfig, 'id' | 'schoolId' | 'updatedAt'>> = [
    { criteriaKey: 'workload_balance', weight: 0.3, enabled: true, customParams: { target_distribution: 'mean', week_pressure_weight: 0.5 } },
    { criteriaKey: 'subject_competency', weight: 0.35, enabled: true, customParams: { primary: 1, secondary: 0.75, capable: 0.45, same_department: 0.3, none: 0 } },
    { criteriaKey: 'class_familiarity', weight: 0.2, enabled: true, customParams: { decay_half_life_terms: 3 } },
    { criteriaKey: 'recency_penalty', weight: 0.15, enabled: true, customParams: { window_days: 14, shape: 'linear' } },
    { criteriaKey: 'preference_policy', weight: 0.1, enabled: false, customParams: { neutral: 0.5, preferred_boost: 0.3, soft_penalty: 0.3 } },
    { criteriaKey: 'weekly_substitute_cap', weight: null, enabled: true, customParams: { max_per_week: 5 } },
    { criteriaKey: 'hard_constraints', weight: null, enabled: true, customParams: { require_competency: false, require_availability: true } },
    { criteriaKey: 'exclusion', weight: null, enabled: true, customParams: { teacher_ids: [], subject_ids: [], grade_level_ids: [] } }
  ];
  return rules.map((rule) => ({
    id: `rule-${schoolId}-${rule.criteriaKey}`,
    schoolId,
    criteriaKey: rule.criteriaKey,
    weight: rule.weight,
    enabled: rule.enabled,
    customParams: rule.customParams,
    updatedAt
  }));
}

export class InMemoryRuleConfigRepository implements RuleConfigRepository {
  private readonly records = new Map<string, SubstituteRuleConfig>();

  constructor(initialRules: SubstituteRuleConfig[] = defaultRuleConfigs('school-steck-demo')) {
    for (const rule of initialRules) {
      this.records.set(ruleKey(rule.schoolId, rule.criteriaKey), rule);
    }
  }

  async list(schoolId: string): Promise<SubstituteRuleConfig[]> {
    const rules = [...this.records.values()].filter((rule) => rule.schoolId === schoolId);
    return rules.length ? sortRules(rules) : defaultRuleConfigs(schoolId);
  }

  async upsert(rules: SubstituteRuleConfig[]): Promise<SubstituteRuleConfig[]> {
    for (const rule of rules) {
      const existing = this.records.get(ruleKey(rule.schoolId, rule.criteriaKey));
      this.records.set(ruleKey(rule.schoolId, rule.criteriaKey), { ...rule, id: existing?.id ?? rule.id });
    }
    return rules;
  }

  async listRuleWeights(schoolId: string): Promise<RuleWeightConfig[]> {
    return toRuleWeights(await this.list(schoolId));
  }
}

export class PostgresRuleConfigRepository implements RuleConfigRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async list(schoolId: string): Promise<SubstituteRuleConfig[]> {
    const result = await this.database.query<RuleConfigRow>(
      `select id, school_id, criteria_key, weight::text, enabled, custom_params, updated_at::text
       from ${tableRef(this.schema, 'rostering_substitute_rule_configs')}
       where school_id = $1
       order by criteria_key`,
      [schoolId]
    );
    return result.rows.length ? sortRules(result.rows.map(toRuleConfig)) : defaultRuleConfigs(schoolId);
  }

  async upsert(rules: SubstituteRuleConfig[]): Promise<SubstituteRuleConfig[]> {
    const saved: SubstituteRuleConfig[] = [];
    for (const rule of rules) {
      const result = await this.database.query<RuleConfigRow>(
        `insert into ${tableRef(this.schema, 'rostering_substitute_rule_configs')}
           (id, school_id, criteria_key, weight, enabled, custom_params, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)
         on conflict (school_id, criteria_key) do update set
           weight = excluded.weight,
           enabled = excluded.enabled,
           custom_params = excluded.custom_params,
           updated_at = excluded.updated_at
         returning id, school_id, criteria_key, weight::text, enabled, custom_params, updated_at::text`,
        [
          rule.id,
          rule.schoolId,
          rule.criteriaKey,
          rule.weight ?? null,
          rule.enabled,
          JSON.stringify(rule.customParams),
          rule.updatedAt
        ]
      );
      saved.push(toRuleConfig(result.rows[0]));
    }
    return saved;
  }

  async listRuleWeights(schoolId: string): Promise<RuleWeightConfig[]> {
    return toRuleWeights(await this.list(schoolId));
  }
}

export function createRuleConfigService(input: {
  repository: RuleConfigRepository;
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
    request: PatchSubstituteRuleConfigRequest;
  }) {
    assertAdmin(session, request.schoolId);
    if (!request.rules.length) {
      throw new TimetableValidationError('At least one rule update is required.');
    }
    const before = await input.repository.list(request.schoolId);
    const merged = mergeRuleUpdates(before, request);
    validateRuleSet(merged);
    const updatedAt = new Date().toISOString();
    const byKey = new Map(before.map((rule) => [rule.criteriaKey, rule]));
    const toSave = request.rules.map((rule) => {
      const existing = byKey.get(rule.criteriaKey);
      return {
        id: existing?.id ?? `rule-${request.schoolId}-${rule.criteriaKey}-${randomUUID()}`,
        schoolId: request.schoolId,
        criteriaKey: rule.criteriaKey,
        weight: isScoringCriteria(rule.criteriaKey) ? (rule.weight ?? 0) : (rule.weight ?? null),
        enabled: rule.enabled,
        customParams: rule.customParams ?? existing?.customParams ?? {},
        updatedAt
      };
    });
    const saved = await input.repository.upsert(toSave);
    const after = await input.repository.list(request.schoolId);
    await input.timetableRepository.appendAudit({
      id: randomUUID(),
      schoolId: request.schoolId,
      actorUserId: session.user.userId,
      actorRole: session.activeRole,
      action: 'substitute_rule_config.patch',
      entityType: 'substitute_rule_config',
      entityId: request.schoolId,
      before,
      after,
      createdAt: updatedAt
    });
    return saved;
  }

  return { list, patch };
}

export function isRuleCriteria(value: string): value is SubstituteRuleCriteriaKey {
  return allCriteria.includes(value as SubstituteRuleCriteriaKey);
}

export function isScoringCriteria(value: string): value is RuleWeightConfig['criteriaKey'] {
  return scoringCriteria.includes(value as RuleWeightConfig['criteriaKey']);
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin' || session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Only school admins can manage substitute rule configuration for their own school.');
  }
}

function validateRuleSet(rules: SubstituteRuleConfig[]): void {
  for (const rule of rules) {
    if (!isRuleCriteria(rule.criteriaKey)) {
      throw new TimetableValidationError(`Unknown substitute rule criteria: ${rule.criteriaKey}`);
    }
    if (rule.weight !== null && rule.weight !== undefined && (rule.weight < 0 || rule.weight > 1)) {
      throw new TimetableValidationError(`Rule weight for ${rule.criteriaKey} must be between 0 and 1.`);
    }
  }
  const enabledScoring = rules.filter((rule) => isScoringCriteria(rule.criteriaKey) && rule.enabled && (rule.weight ?? 0) > 0);
  if (!enabledScoring.length) {
    throw new TimetableValidationError('At least one enabled scoring criterion must have weight > 0.');
  }
}

function mergeRuleUpdates(current: SubstituteRuleConfig[], request: PatchSubstituteRuleConfigRequest): SubstituteRuleConfig[] {
  const merged = new Map(current.map((rule) => [rule.criteriaKey, rule]));
  for (const update of request.rules) {
    if (!isRuleCriteria(update.criteriaKey)) {
      throw new TimetableValidationError(`Unknown substitute rule criteria: ${update.criteriaKey}`);
    }
    const existing = merged.get(update.criteriaKey);
    merged.set(update.criteriaKey, {
      id: existing?.id ?? `rule-${request.schoolId}-${update.criteriaKey}`,
      schoolId: request.schoolId,
      criteriaKey: update.criteriaKey,
      weight: isScoringCriteria(update.criteriaKey) ? (update.weight ?? 0) : (update.weight ?? null),
      enabled: update.enabled,
      customParams: update.customParams ?? existing?.customParams ?? {},
      updatedAt: existing?.updatedAt ?? new Date().toISOString()
    });
  }
  return [...merged.values()];
}

function toRuleWeights(rules: SubstituteRuleConfig[]): RuleWeightConfig[] {
  return rules.flatMap((rule): RuleWeightConfig[] =>
    isScoringCriteria(rule.criteriaKey)
      ? [{ criteriaKey: rule.criteriaKey, weight: rule.weight ?? 0, enabled: rule.enabled }]
      : []
  );
}

function sortRules(rules: SubstituteRuleConfig[]): SubstituteRuleConfig[] {
  const order = new Map(allCriteria.map((key, index) => [key, index]));
  return [...rules].sort((left, right) => (order.get(left.criteriaKey) ?? 99) - (order.get(right.criteriaKey) ?? 99));
}

function ruleKey(schoolId: string, criteriaKey: SubstituteRuleCriteriaKey): string {
  return `${schoolId}:${criteriaKey}`;
}

function toRuleConfig(row: RuleConfigRow): SubstituteRuleConfig {
  return {
    id: row.id,
    schoolId: row.school_id,
    criteriaKey: row.criteria_key,
    weight: row.weight === null ? null : Number(row.weight),
    enabled: row.enabled,
    customParams: row.custom_params ?? {},
    updatedAt: row.updated_at
  };
}

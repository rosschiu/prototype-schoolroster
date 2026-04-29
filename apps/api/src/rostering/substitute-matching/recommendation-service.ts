import { createHash } from 'node:crypto';
import type {
  SubstitutePreferenceRule,
  SubstituteRecommendation,
  SubstituteRecommendationJob
} from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';
import type { LeaveRepository } from '../leave/leave-service.js';
import { TimetableValidationError, type TimetableRepository } from '../timetable/timetable-service.js';
import type { AvailabilityRepository } from '../availability/availability-service.js';
import type { RecommendationJobRepository } from '../recommendation-jobs/recommendation-job-repository.js';
import {
  rankSubstituteCandidates,
  scoreClassFamiliarity,
  scorePreferencePolicy,
  scoreRecencyPenalty,
  scoreSubjectCompetency,
  scoreWorkloadBalance,
  type CompetencyLevel,
  type CompositeCandidateInput,
  type RuleWeightConfig
} from './scoring.js';

export type SubstituteTeacherCandidate = {
  teacherId: string;
  teacherName: string;
};

export type TeacherCompetencyRecord = {
  teacherId: string;
  subjectId: string;
  level: CompetencyLevel;
};

export type TeacherClassFamiliarityRecord = {
  teacherId: string;
  scheduleSessionId?: string;
  familiarityScore: number;
};

export type SubstituteRecommendationRepository = {
  listTeachers(schoolId: string): Promise<SubstituteTeacherCandidate[]>;
  listRuleConfigs(schoolId: string): Promise<RuleWeightConfig[]>;
  getHardConstraints(schoolId: string): Promise<{ requireCompetency: boolean; weeklySubstituteCap: number; excludedTeacherIds: string[] }>;
  listActiveAssignmentCounts(schoolId: string): Promise<Map<string, number>>;
  listTeacherCompetencies(schoolId: string): Promise<TeacherCompetencyRecord[]>;
  listTeacherClassFamiliarities(schoolId: string): Promise<TeacherClassFamiliarityRecord[]>;
  listPreferenceRules(schoolId: string): Promise<SubstitutePreferenceRule[]>;
};

export class InMemorySubstituteRecommendationRepository implements SubstituteRecommendationRepository {
  constructor(
    private readonly teachers: SubstituteTeacherCandidate[] = [
      { teacherId: 'teacher-demo', teacherName: 'Teacher Demo' },
      { teacherId: 'teacher-multirole-demo', teacherName: 'Multi Role Demo' },
      { teacherId: 'teacher-sub-a', teacherName: 'Substitute A' },
      { teacherId: 'teacher-sub-b', teacherName: 'Substitute B' }
    ],
    private readonly ruleConfigs: RuleWeightConfig[] = defaultRecommendationRuleConfigs(),
    private readonly competencies: TeacherCompetencyRecord[] = [],
    private readonly familiarities: TeacherClassFamiliarityRecord[] = [],
    private readonly ruleConfigProvider?: { listRuleWeights(schoolId: string): Promise<RuleWeightConfig[]> },
    private readonly preferenceRuleProvider?: { list(schoolId: string): Promise<SubstitutePreferenceRule[]> }
  ) {}

  async listTeachers(): Promise<SubstituteTeacherCandidate[]> {
    return this.teachers;
  }

  async listRuleConfigs(schoolId: string): Promise<RuleWeightConfig[]> {
    if (this.ruleConfigProvider) {
      return this.ruleConfigProvider.listRuleWeights(schoolId);
    }
    return this.ruleConfigs;
  }

  async getHardConstraints(): Promise<{ requireCompetency: boolean; weeklySubstituteCap: number; excludedTeacherIds: string[] }> {
    return { requireCompetency: false, weeklySubstituteCap: 5, excludedTeacherIds: [] };
  }

  async listActiveAssignmentCounts(): Promise<Map<string, number>> {
    return new Map();
  }

  async listTeacherCompetencies(): Promise<TeacherCompetencyRecord[]> {
    return this.competencies;
  }

  async listTeacherClassFamiliarities(): Promise<TeacherClassFamiliarityRecord[]> {
    return this.familiarities;
  }

  async listPreferenceRules(schoolId: string): Promise<SubstitutePreferenceRule[]> {
    return this.preferenceRuleProvider ? this.preferenceRuleProvider.list(schoolId) : [];
  }
}

type TeacherRow = {
  id: string;
  display_name: string;
};

type RuleConfigRow = {
  criteria_key: string;
  weight: string | null;
  enabled: boolean;
  custom_params?: Record<string, unknown>;
};

type CompetencyRow = {
  teacher_id: string;
  subject_id: string;
  level: CompetencyLevel;
};

type FamiliarityRow = {
  teacher_id: string;
  schedule_session_id: string | null;
  familiarity_score: string;
};

type PreferenceRuleRow = {
  id: string;
  school_id: string;
  substitute_teacher_id: string;
  scope: SubstitutePreferenceRule['scope'];
  preference_type: SubstitutePreferenceRule['preferenceType'];
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

export class PostgresSubstituteRecommendationRepository implements SubstituteRecommendationRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async listTeachers(schoolId: string): Promise<SubstituteTeacherCandidate[]> {
    const result = await this.database.query<TeacherRow>(
      `select id, display_name
       from ${tableRef(this.schema, 'teachers')}
       where school_id = $1
       order by display_name, id`,
      [schoolId]
    );
    return result.rows.map((row) => ({ teacherId: row.id, teacherName: row.display_name }));
  }

  async listRuleConfigs(schoolId: string): Promise<RuleWeightConfig[]> {
    const result = await this.database.query<RuleConfigRow>(
      `select criteria_key, weight::text, enabled
       from ${tableRef(this.schema, 'rostering_substitute_rule_configs')}
       where school_id = $1
       order by criteria_key`,
      [schoolId]
    );
    const configs = result.rows.flatMap((row): RuleWeightConfig[] => {
      if (!isScoringCriteria(row.criteria_key)) return [];
      return [{
        criteriaKey: row.criteria_key,
        weight: row.weight === null ? null : Number(row.weight),
        enabled: row.enabled
      }];
    });
    return configs.length ? configs : defaultRecommendationRuleConfigs();
  }

  async getHardConstraints(schoolId: string): Promise<{ requireCompetency: boolean; weeklySubstituteCap: number; excludedTeacherIds: string[] }> {
    const result = await this.database.query<Required<RuleConfigRow>>(
      `select criteria_key, weight::text, enabled, custom_params
       from ${tableRef(this.schema, 'rostering_substitute_rule_configs')}
       where school_id = $1 and criteria_key in ('hard_constraints', 'weekly_substitute_cap', 'exclusion')`,
      [schoolId]
    );
    const hard = result.rows.find((row) => row.criteria_key === 'hard_constraints');
    const cap = result.rows.find((row) => row.criteria_key === 'weekly_substitute_cap');
    const exclusion = result.rows.find((row) => row.criteria_key === 'exclusion');
    return {
      requireCompetency: Boolean(hard?.custom_params?.require_competency),
      weeklySubstituteCap: Number(cap?.custom_params?.max_per_week ?? 5),
      excludedTeacherIds: Array.isArray(exclusion?.custom_params?.teacher_ids)
        ? exclusion.custom_params.teacher_ids.filter((item): item is string => typeof item === 'string')
        : []
    };
  }

  async listActiveAssignmentCounts(schoolId: string): Promise<Map<string, number>> {
    const result = await this.database.query<{ substitute_teacher_id: string; assignment_count: string }>(
      `select substitute_teacher_id, count(*)::text as assignment_count
       from ${tableRef(this.schema, 'rostering_substitute_assignments')}
       where school_id = $1 and status in ('assigned', 'offered', 'acknowledged', 'accepted', 'completed')
       group by substitute_teacher_id`,
      [schoolId]
    );
    return new Map(result.rows.map((row) => [row.substitute_teacher_id, Number(row.assignment_count)]));
  }

  async listTeacherCompetencies(schoolId: string): Promise<TeacherCompetencyRecord[]> {
    const result = await this.database.query<CompetencyRow>(
      `select teacher_id, subject_id, level
       from ${tableRef(this.schema, 'rostering_teacher_competencies')}
       where school_id = $1`,
      [schoolId]
    );
    return result.rows.map((row) => ({ teacherId: row.teacher_id, subjectId: row.subject_id, level: row.level }));
  }

  async listTeacherClassFamiliarities(schoolId: string): Promise<TeacherClassFamiliarityRecord[]> {
    const result = await this.database.query<FamiliarityRow>(
      `select teacher_id, schedule_session_id, familiarity_score::text
       from ${tableRef(this.schema, 'rostering_teacher_class_familiarities')}
       where school_id = $1`,
      [schoolId]
    );
    return result.rows.map((row) => ({
      teacherId: row.teacher_id,
      scheduleSessionId: row.schedule_session_id ?? undefined,
      familiarityScore: Number(row.familiarity_score)
    }));
  }

  async listPreferenceRules(schoolId: string): Promise<SubstitutePreferenceRule[]> {
    const result = await this.database.query<PreferenceRuleRow>(
      `select id, school_id, substitute_teacher_id, scope, preference_type, weight::text, schedule_session_id,
              original_teacher_id, subject_id, grade_level_id, reason, enabled, updated_by, updated_at::text
       from ${tableRef(this.schema, 'rostering_substitute_preference_rules')}
       where school_id = $1 and enabled = true`,
      [schoolId]
    );
    return result.rows.map((row) => ({
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
    }));
  }
}

export type SubstituteRecommendationService = ReturnType<typeof createSubstituteRecommendationService>;

export function createSubstituteRecommendationService(input: {
  timetableRepository: TimetableRepository;
  leaveRepository: LeaveRepository;
  availabilityRepository?: AvailabilityRepository;
  recommendationRepository: SubstituteRecommendationRepository;
  jobRepository: RecommendationJobRepository;
}) {
  async function computeRecommendations({
    session,
    leaveId,
    sessionId
  }: {
    session: AuthenticatedRosterSession;
    leaveId: string;
    sessionId: string;
  }): Promise<{ recommendations: SubstituteRecommendation[]; reason_codes: string[] }> {
    if (session.activeRole !== 'school_admin') {
      throw new TimetableValidationError('Only school admins can request substitute recommendations.');
    }

    const leaveRequest = await input.leaveRepository.getLeaveRequest(leaveId);
    if (!leaveRequest) throw new TimetableValidationError('Leave request was not found.');
    if (leaveRequest.schoolId !== session.activeSchoolId) {
      throw new TimetableValidationError('Cross-school leave recommendation access is not allowed.');
    }

    const targetSession = await input.timetableRepository.getClassSession(sessionId);
    if (!targetSession) throw new TimetableValidationError('Schedule session was not found.');
    if (targetSession.schoolId !== leaveRequest.schoolId || targetSession.assignedTeacherId !== leaveRequest.teacherId) {
      throw new TimetableValidationError('Session does not match the leave request teacher and school.');
    }

    const impact = (await input.leaveRepository.listLeaveImpacts(leaveId)).find(
      (item) => item.classSessionId === sessionId && item.status === 'active'
    );
    if (!impact || !impact.coverageRequired || ['cancelled', 'no_coverage_needed'].includes(impact.coverageStatus)) {
      return { recommendations: [], reason_codes: ['NO_COVERAGE_REQUIRED'] };
    }

    const allSessions = await input.timetableRepository.listClassSessions(targetSession.schoolId, targetSession.termId);
    const allCandidates = await input.recommendationRepository.listTeachers(targetSession.schoolId);
    const competencies = await input.recommendationRepository.listTeacherCompetencies(targetSession.schoolId);
    const familiarities = await input.recommendationRepository.listTeacherClassFamiliarities(targetSession.schoolId);
    const rules = await input.recommendationRepository.listRuleConfigs(targetSession.schoolId);
    const preferenceRules = await input.recommendationRepository.listPreferenceRules(targetSession.schoolId);
    const hardConstraints = await input.recommendationRepository.getHardConstraints(targetSession.schoolId);
    const activeAssignmentCounts = await input.recommendationRepository.listActiveAssignmentCounts(targetSession.schoolId);
    const availabilities = input.availabilityRepository
      ? await input.availabilityRepository.list({
          schoolId: targetSession.schoolId,
          startDate: impact.impactDate,
          endDate: impact.impactDate
        })
      : [];
    const approvedLeaves = await input.leaveRepository.listLeaveRequests(targetSession.schoolId, { status: 'approved' });

    const feasible = allCandidates.filter((candidate) => {
      if (candidate.teacherId === leaveRequest.teacherId) return false;
      if (hardConstraints.excludedTeacherIds.includes(candidate.teacherId)) return false;
      const preferenceEffect = pickPreferenceEffect(preferenceRules, { candidateTeacherId: candidate.teacherId, targetSession, originalTeacherId: leaveRequest.teacherId });
      if (preferenceEffect.hardExcluded) return false;
      if ((activeAssignmentCounts.get(candidate.teacherId) ?? 0) >= hardConstraints.weeklySubstituteCap) return false;
      if (hardConstraints.requireCompetency && !competencies.some((record) => record.teacherId === candidate.teacherId && record.subjectId === targetSession.subjectId)) {
        return false;
      }
      if (approvedLeaves.some((leave) => leave.teacherId === candidate.teacherId && leave.startDate <= impact.impactDate && leave.endDate >= impact.impactDate)) {
        return false;
      }
      if (availabilities.some(
        (availability) =>
          availability.teacherId === candidate.teacherId &&
          availability.date === impact.impactDate &&
          availability.availabilityStatus === 'unavailable' &&
          (!availability.timetablePeriodId || availability.timetablePeriodId === targetSession.timetablePeriodId)
      )) {
        return false;
      }
      return !allSessions.some(
        (item) =>
          item.id !== targetSession.id &&
          item.assignedTeacherId === candidate.teacherId &&
          item.timetablePeriodId === targetSession.timetablePeriodId &&
          ['draft', 'published'].includes(item.status)
      );
    });

    if (!feasible.length) {
      return { recommendations: [], reason_codes: ['NO_AVAILABLE_SUBSTITUTE'] };
    }

    const workloadInputs = feasible.map((candidate) => ({
      teacherId: candidate.teacherId,
      termSubUnits: allSessions.filter((item) => item.assignedTeacherId === candidate.teacherId && item.status === 'published').length,
      weekSubUnits: allSessions.filter(
        (item) =>
          item.assignedTeacherId === candidate.teacherId &&
          item.status === 'published' &&
          item.timetablePeriodId === targetSession.timetablePeriodId
      ).length
    }));
    const workloadScores = new Map(scoreWorkloadBalance(workloadInputs).map((score) => [score.teacherId, score]));

    const compositeCandidates: CompositeCandidateInput[] = feasible.map((candidate) => {
      const competency = competencies.find(
        (record) => record.teacherId === candidate.teacherId && record.subjectId === targetSession.subjectId
      );
      const familiarity = familiarities.find(
        (record) => record.teacherId === candidate.teacherId && record.scheduleSessionId === targetSession.id
      );
      const subjectCompetency = scoreSubjectCompetency({
        competencyLevel: competency?.level ?? 'none',
        gradeMatch: 'same'
      });
      const classFamiliarity = scoreClassFamiliarity({ manualFamiliarity: familiarity?.familiarityScore ?? 0 });
      const preferenceEffect = pickPreferenceEffect(preferenceRules, { candidateTeacherId: candidate.teacherId, targetSession, originalTeacherId: leaveRequest.teacherId });
      return {
        teacherId: candidate.teacherId,
        teacherName: candidate.teacherName,
        workload: workloadScores.get(candidate.teacherId) ?? scoreWorkloadBalance([{ teacherId: candidate.teacherId, termSubUnits: 0, weekSubUnits: 0 }])[0],
        subjectCompetency: { ...subjectCompetency, competencyLevel: competency?.level ?? 'none' },
        classFamiliarity,
        recencyPenalty: { score: scoreRecencyPenalty({ daysSinceLastSub: null }), daysSinceLastSub: null },
        preferencePolicy: scorePreferencePolicy({
          preferredBoost: preferenceEffect.preferredBoost,
          softPenalty: preferenceEffect.softPenalty,
          hardExcluded: preferenceEffect.hardExcluded,
          ruleIds: preferenceEffect.ruleIds
        }),
        reasonCodes: buildReasonCodes({ competencyLevel: competency?.level, workloadScore: workloadScores.get(candidate.teacherId)?.score ?? 1 })
      };
    });

    return {
      recommendations: rankSubstituteCandidates({ candidates: compositeCandidates, ruleConfigs: rules }),
      reason_codes: []
    };
  }

  async function recommend(inputRequest: {
    session: AuthenticatedRosterSession;
    leaveId: string;
    sessionId: string;
    asyncMode?: boolean;
  }): Promise<SubstituteRecommendationJob> {
    const now = new Date().toISOString();
    const jobId = recommendationJobId(inputRequest.leaveId, inputRequest.sessionId);
    const existing = await input.jobRepository.get(jobId);
    if (existing?.status === 'completed' && inputRequest.asyncMode) {
      return existing;
    }
    const leaveRequest = await input.leaveRepository.getLeaveRequest(inputRequest.leaveId);
    if (!leaveRequest) throw new TimetableValidationError('Leave request was not found.');
    if (leaveRequest.schoolId !== inputRequest.session.activeSchoolId) {
      throw new TimetableValidationError('Cross-school leave recommendation access is not allowed.');
    }
    const runningJob: SubstituteRecommendationJob = {
      job_id: jobId,
      status: 'running',
      current_step: 'scoring_candidates',
      progress: 0.5,
      school_id: leaveRequest.schoolId,
      leave_id: inputRequest.leaveId,
      session_id: inputRequest.sessionId,
      created_at: existing?.created_at ?? now,
      updated_at: now
    };
    await input.jobRepository.upsert(runningJob);

    const computed = await computeRecommendations(inputRequest);
    const completedJob: SubstituteRecommendationJob = {
      job_id: jobId,
      status: 'completed',
      current_step: 'completed',
      progress: 1,
      school_id: leaveRequest.schoolId,
      leave_id: inputRequest.leaveId,
      session_id: inputRequest.sessionId,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      result: computed
    };
    await input.jobRepository.upsert(completedJob);
    return inputRequest.asyncMode ? runningJob : completedJob;
  }

  async function getJob({
    session,
    jobId
  }: {
    session: AuthenticatedRosterSession;
    jobId: string;
  }): Promise<SubstituteRecommendationJob | null> {
    if (session.activeRole !== 'school_admin') {
      throw new TimetableValidationError('Only school admins can view substitute recommendation jobs.');
    }
    const job = await input.jobRepository.get(jobId);
    if (job && job.school_id !== session.activeSchoolId) {
      throw new TimetableValidationError('Cross-school recommendation job access is not allowed.');
    }
    return job;
  }

  return { recommend, getJob };
}

function defaultRecommendationRuleConfigs(): RuleWeightConfig[] {
  return [
    { criteriaKey: 'workload_balance', weight: 0.3, enabled: true },
    { criteriaKey: 'subject_competency', weight: 0.35, enabled: true },
    { criteriaKey: 'class_familiarity', weight: 0.2, enabled: true },
    { criteriaKey: 'recency_penalty', weight: 0.15, enabled: true },
    { criteriaKey: 'preference_policy', weight: 0.1, enabled: false }
  ];
}

function isScoringCriteria(value: string): value is RuleWeightConfig['criteriaKey'] {
  return ['workload_balance', 'subject_competency', 'class_familiarity', 'recency_penalty', 'preference_policy'].includes(value);
}

function pickPreferenceEffect(
  rules: SubstitutePreferenceRule[],
  context: {
    candidateTeacherId: string;
    targetSession: { id: string; subjectId: string; gradeLevelId: string; assignedTeacherId?: string };
    originalTeacherId: string;
  }
): { hardExcluded: boolean; preferredBoost: number; softPenalty: number; ruleIds: string[] } {
  const matching = rules.filter((rule) => rule.enabled && rule.substituteTeacherId === context.candidateTeacherId && preferenceRuleMatches(rule, context));
  const highestPrecedence = Math.max(-1, ...matching.map((rule) => preferenceScopePrecedence(rule.scope)));
  const scopedMatching = highestPrecedence < 0
    ? []
    : matching.filter((rule) => preferenceScopePrecedence(rule.scope) === highestPrecedence);
  if (scopedMatching.some((rule) => rule.preferenceType === 'hard_exclusion')) {
    return { hardExcluded: true, preferredBoost: 0, softPenalty: 0, ruleIds: scopedMatching.map((rule) => rule.id) };
  }
  return {
    hardExcluded: false,
    preferredBoost: Math.max(0, ...scopedMatching.filter((rule) => rule.preferenceType === 'preferred').map((rule) => rule.weight ?? 0.3)),
    softPenalty: Math.max(0, ...scopedMatching.filter((rule) => rule.preferenceType === 'soft_avoid').map((rule) => rule.weight ?? 0.3)),
    ruleIds: scopedMatching.map((rule) => rule.id)
  };
}

function preferenceScopePrecedence(scope: SubstitutePreferenceRule['scope']): number {
  switch (scope) {
    case 'schedule_session':
      return 6;
    case 'original_teacher':
      return 5;
    case 'subject_grade':
      return 4;
    case 'subject':
      return 3;
    case 'teacher':
      return 2;
    case 'school':
      return 1;
    default:
      return 0;
  }
}

function preferenceRuleMatches(
  rule: SubstitutePreferenceRule,
  context: {
    targetSession: { id: string; subjectId: string; gradeLevelId: string };
    originalTeacherId: string;
  }
): boolean {
  switch (rule.scope) {
    case 'schedule_session':
      return rule.scheduleSessionId === context.targetSession.id;
    case 'original_teacher':
      return rule.originalTeacherId === context.originalTeacherId;
    case 'subject_grade':
      return rule.subjectId === context.targetSession.subjectId && rule.gradeLevelId === context.targetSession.gradeLevelId;
    case 'subject':
      return rule.subjectId === context.targetSession.subjectId;
    case 'teacher':
      return true;
    case 'school':
      return true;
    default:
      return false;
  }
}

function recommendationJobId(leaveId: string, sessionId: string): string {
  return createHash('sha256').update(`${leaveId}:${sessionId}:v1`).digest('hex').slice(0, 24);
}

function buildReasonCodes(input: { competencyLevel?: CompetencyLevel; workloadScore: number }): string[] {
  return [
    input.competencyLevel === 'primary' ? 'PRIMARY_SUBJECT_MATCH' : undefined,
    input.competencyLevel === 'secondary' ? 'SECONDARY_SUBJECT_MATCH' : undefined,
    input.workloadScore >= 0.8 ? 'LOW_WORKLOAD' : undefined
  ].filter((item): item is string => Boolean(item));
}

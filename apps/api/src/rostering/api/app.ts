import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import type { ApiErrorShape } from '../../../../../packages/contracts/src/common.js';
import type { SignInRequest } from '../../../../../packages/contracts/src/auth.js';
import type {
  CreateClassSessionRequest,
  CreateTimetableRequest,
  PatchSubstituteRuleConfigRequest,
  PatchSubstitutePreferenceRulesRequest,
  ScheduleProjectionType,
  CreateSubstituteAssignmentRequest,
  ReassignSubstituteAssignmentRequest,
  UpdateSubstituteAssignmentStatusRequest,
  UpdateClassSessionRequest,
  UpdateTimetablePeriodsRequest,
  ReportExportType
} from '../../../../../packages/contracts/src/rostering.js';
import {
  createRosterAuditService,
  InMemoryAuditRepository,
  PostgresAuditRepository,
  type AuditEventSource,
  type RosterAuditQuery,
  type RosterAuditRepository
} from '../audit/audit-service.js';
import {
  ROSTER_CSRF_HEADER_NAME,
  ROSTER_SESSION_COOKIE_NAME,
  buildSessionCookies,
  createPostgresStandaloneAuthService,
  createStandaloneAuthService,
  isUnsafeMethod,
  parseCookies,
  seedPostgresStandaloneAuth,
  type StandaloneAuthService
} from '../auth/auth-service.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import { createAvailabilityService, InMemoryAvailabilityRepository, PostgresAvailabilityRepository, type AvailabilityRepository } from '../availability/availability-service.js';
import { createStandaloneRosterAuthSeed } from '../auth/seed.js';
import { createCalendarService, InMemoryCalendarRepository } from '../calendar/calendar-service.js';
import { PostgresCalendarRepository, type CalendarRepository } from '../calendar/calendar-service.js';
import { createRuleConfigService, InMemoryRuleConfigRepository, PostgresRuleConfigRepository, type RuleConfigRepository } from '../config/rule-config-service.js';
import { createCoverageService } from '../coverage/coverage-service.js';
import { createLeaveService, InMemoryLeaveRepository, PostgresLeaveRepository, type LeaveRepository } from '../leave/leave-service.js';
import { createNotificationService, InMemoryNotificationRepository, PostgresNotificationRepository, type NotificationRepository } from '../notifications/notification-service.js';
import { createResourceService, InMemoryResourceRepository } from '../resources/resource-service.js';
import { PostgresResourceRepository, type ResourceRepository } from '../resources/resource-service.js';
import { createRosterReportService, type ReportQuery } from '../reports/report-service.js';
import { createPreferenceRuleService, InMemoryPreferenceRuleRepository, PostgresPreferenceRuleRepository, type PreferenceRuleRepository } from '../rules/preference-rule-service.js';
import {
  createSubstituteAssignmentService,
  InMemorySubstituteAssignmentRepository,
  PostgresSubstituteAssignmentRepository,
  type SubstituteAssignmentRepository
} from '../substitute-assignments/substitute-assignment-service.js';
import {
  createSubstituteRecommendationService,
  InMemorySubstituteRecommendationRepository,
  PostgresSubstituteRecommendationRepository,
  type SubstituteRecommendationRepository
} from '../substitute-matching/recommendation-service.js';
import {
  InMemoryRecommendationJobRepository,
  PostgresRecommendationJobRepository,
  type RecommendationJobRepository
} from '../recommendation-jobs/recommendation-job-repository.js';
import { createSessionService } from '../timetable/session-service.js';
import {
  createTimetableService,
  InMemoryTimetableRepository,
  PostgresTimetableRepository,
  TimetableConflictError,
  TimetableValidationError,
  type TimetableRepository
} from '../timetable/timetable-service.js';
import { seedPostgresRosteringReferenceData } from '../db/seed.js';

export type RosterApiServices = {
  authService: StandaloneAuthService;
  timetableRepository: TimetableRepository;
  calendarRepository?: CalendarRepository;
  resourceRepository?: ResourceRepository;
  leaveRepository?: LeaveRepository;
  notificationRepository?: NotificationRepository;
  substituteRecommendationRepository?: SubstituteRecommendationRepository;
  availabilityRepository?: AvailabilityRepository;
  recommendationJobRepository?: RecommendationJobRepository;
  ruleConfigRepository?: RuleConfigRepository;
  preferenceRuleRepository?: PreferenceRuleRepository;
  substituteAssignmentRepository?: SubstituteAssignmentRepository;
  auditRepository?: RosterAuditRepository;
};

export async function createDefaultRosterApiServices(input?: {
  database?: PostgresDatabase;
  schema?: string;
}): Promise<RosterApiServices> {
  const seed = await createStandaloneRosterAuthSeed();
  const authService = input?.database && input.schema
    ? createPostgresStandaloneAuthService({ database: input.database, schema: input.schema })
    : createStandaloneAuthService({ seed });
  if (input?.database && input.schema) {
    await seedPostgresStandaloneAuth({ database: input.database, schema: input.schema, seed });
    await seedPostgresRosteringReferenceData({ database: input.database, schema: input.schema });
  }

  return {
    authService,
    timetableRepository: input?.database && input.schema
      ? new PostgresTimetableRepository(input.database, input.schema)
      : new InMemoryTimetableRepository(),
    calendarRepository: input?.database && input.schema
      ? new PostgresCalendarRepository(input.database, input.schema)
      : undefined,
    resourceRepository: input?.database && input.schema
      ? new PostgresResourceRepository(input.database, input.schema)
      : undefined,
    leaveRepository: input?.database && input.schema
      ? new PostgresLeaveRepository(input.database, input.schema)
      : undefined,
    notificationRepository: input?.database && input.schema
      ? new PostgresNotificationRepository(input.database, input.schema)
      : undefined,
    substituteRecommendationRepository: input?.database && input.schema
      ? new PostgresSubstituteRecommendationRepository(input.database, input.schema)
      : undefined,
    availabilityRepository: input?.database && input.schema
      ? new PostgresAvailabilityRepository(input.database, input.schema)
      : undefined,
    recommendationJobRepository: input?.database && input.schema
      ? new PostgresRecommendationJobRepository(input.database, input.schema)
      : undefined,
    ruleConfigRepository: input?.database && input.schema
      ? new PostgresRuleConfigRepository(input.database, input.schema)
      : undefined,
    preferenceRuleRepository: input?.database && input.schema
      ? new PostgresPreferenceRuleRepository(input.database, input.schema)
      : undefined,
    substituteAssignmentRepository: input?.database && input.schema
      ? new PostgresSubstituteAssignmentRepository(input.database, input.schema)
      : undefined,
    auditRepository: input?.database && input.schema
      ? new PostgresAuditRepository(input.database, input.schema)
      : undefined
  };
}

function toMessageKey(code: string): string {
  return `api.error.${code.toLowerCase()}`;
}

function apiError(reply: FastifyReply, statusCode: number, code: string, message: string): ApiErrorShape {
  reply.code(statusCode);
  return { code, messageKey: toMessageKey(code), message };
}

function authError(reply: FastifyReply) {
  return apiError(reply, 401, 'AUTH_REQUIRED', 'A valid roster session is required.');
}

function forbidden(reply: FastifyReply, message = 'This roster operation is not allowed for the current session.') {
  return apiError(reply, 403, 'AUTH_FORBIDDEN', message);
}

function badRequest(reply: FastifyReply, message: string) {
  return apiError(reply, 400, 'ROSTER_VALIDATION_ERROR', message);
}

function conflict(reply: FastifyReply, message: string) {
  return apiError(reply, 409, 'ROSTER_CONFLICT', message);
}

function shouldUseSecureCookie(request: FastifyRequest): boolean {
  return request.headers['x-forwarded-proto'] === 'https' || request.protocol === 'https';
}

function sessionTokenFrom(request: FastifyRequest): string | undefined {
  return parseCookies(request.headers.cookie)[ROSTER_SESSION_COOKIE_NAME];
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireText(value: unknown, name: string): string {
  if (!hasText(value)) {
    throw new TimetableValidationError(`${name} is required.`);
  }
  return value.trim();
}

function normalizeCreateTimetableRequest(body: unknown): CreateTimetableRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  return {
    schoolId: requireText(value.schoolId, 'schoolId'),
    termId: requireText(value.termId, 'termId'),
    name: requireText(value.name, 'name'),
    templateKey: hasText(value.templateKey) ? value.templateKey : undefined,
    timezone: hasText(value.timezone) ? value.timezone : undefined
  };
}

function normalizeCreateSessionRequest(body: unknown): CreateClassSessionRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  return {
    id: hasText(value.id) ? value.id : undefined,
    schoolId: requireText(value.schoolId, 'schoolId'),
    termId: requireText(value.termId, 'termId'),
    timetableId: requireText(value.timetableId, 'timetableId'),
    timetablePeriodId: requireText(value.timetablePeriodId, 'timetablePeriodId'),
    subjectId: requireText(value.subjectId, 'subjectId'),
    gradeLevelId: requireText(value.gradeLevelId, 'gradeLevelId'),
    section: requireText(value.section, 'section'),
    roomId: hasText(value.roomId) ? value.roomId : undefined,
    assignedTeacherId: hasText(value.assignedTeacherId) ? value.assignedTeacherId : undefined,
    equipmentResourceIds: Array.isArray(value.equipmentResourceIds)
      ? value.equipmentResourceIds.filter((item): item is string => typeof item === 'string')
      : [],
    status: value.status === 'published' || value.status === 'archived' || value.status === 'cancelled' ? value.status : 'draft',
    notes: hasText(value.notes) ? value.notes : undefined
  };
}

function normalizeUpdateTimetablePeriodsRequest(body: unknown): UpdateTimetablePeriodsRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  const periods = Array.isArray(value.periods)
    ? value.periods.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  return {
    periods: periods.map((period) => ({
      id: hasText(period.id) ? period.id : undefined,
      dayIndex: Number(period.dayIndex),
      periodIndex: Number(period.periodIndex),
      label: requireText(period.label, 'label'),
      startTime: requireText(period.startTime, 'startTime'),
      endTime: requireText(period.endTime, 'endTime'),
      halfDay: requireText(period.halfDay, 'halfDay') as UpdateTimetablePeriodsRequest['periods'][number]['halfDay'],
      sortOrder: period.sortOrder === undefined ? undefined : Number(period.sortOrder),
      isTeachingPeriod: typeof period.isTeachingPeriod === 'boolean' ? period.isTeachingPeriod : undefined
    }))
  };
}


function normalizeCreateLeaveRequest(body: unknown) {
  const value = (body ?? {}) as Record<string, unknown>;
  const durationType = requireText(value.durationType, 'durationType');
  if (!['full_day', 'am_half_day', 'pm_half_day'].includes(durationType)) {
    throw new TimetableValidationError('durationType must be full_day, am_half_day, or pm_half_day.');
  }
  return {
    schoolId: requireText(value.schoolId, 'schoolId'),
    termId: requireText(value.termId, 'termId'),
    teacherId: requireText(value.teacherId, 'teacherId'),
    startDate: requireText(value.startDate, 'startDate'),
    endDate: requireText(value.endDate, 'endDate'),
    durationType: durationType as 'full_day' | 'am_half_day' | 'pm_half_day',
    leaveType: requireText(value.leaveType, 'leaveType'),
    reason: hasText(value.reason) ? value.reason : undefined,
    coverageRequired: typeof value.coverageRequired === 'boolean' ? value.coverageRequired : undefined,
    substituteNotes: hasText(value.substituteNotes) ? value.substituteNotes : undefined,
    adminCreateReason: hasText(value.adminCreateReason ?? value.admin_create_reason) ? String(value.adminCreateReason ?? value.admin_create_reason).trim() : undefined
  };
}

function normalizeImpactAdjustmentRequest(body: unknown) {
  const value = (body ?? {}) as Record<string, unknown>;
  const arrayOfObjects = (input: unknown): Record<string, unknown>[] =>
    Array.isArray(input) ? input.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
  return {
    adjustmentReason: requireText(value.adjustmentReason ?? value.admin_adjustment_reason, 'adjustmentReason'),
    add: arrayOfObjects(value.add).map((item) => ({
      classSessionId: requireText(item.classSessionId, 'classSessionId'),
      impactDate: requireText(item.impactDate, 'impactDate'),
      coverageRequired: typeof item.coverageRequired === 'boolean' ? item.coverageRequired : undefined
    })),
    removeImpactIds: Array.isArray(value.removeImpactIds) ? value.removeImpactIds.filter((item): item is string => typeof item === 'string') : [],
    updateCoverage: arrayOfObjects(value.updateCoverage).map((item) => ({
      impactId: requireText(item.impactId, 'impactId'),
      coverageRequired: Boolean(item.coverageRequired)
    }))
  };
}

function normalizeAvailabilityPatchRequest(body: unknown) {
  const value = (body ?? {}) as Record<string, unknown>;
  const records = Array.isArray(value.records)
    ? value.records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  return {
    schoolId: requireText(value.schoolId, 'schoolId'),
    teacherId: requireText(value.teacherId, 'teacherId'),
    records: records.map((item) => ({
      date: requireText(item.date, 'date'),
      timetablePeriodId: hasText(item.timetablePeriodId) ? item.timetablePeriodId : undefined,
      availabilityStatus: requireText(item.availabilityStatus, 'availabilityStatus') as 'available' | 'unavailable' | 'limited',
      reason: hasText(item.reason) ? item.reason : undefined
    }))
  };
}

function normalizeRuleConfigPatchRequest(body: unknown): PatchSubstituteRuleConfigRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  const rules = Array.isArray(value.rules)
    ? value.rules.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  return {
    schoolId: requireText(value.schoolId, 'schoolId'),
    rules: rules.map((item) => ({
      criteriaKey: requireText(item.criteriaKey, 'criteriaKey') as PatchSubstituteRuleConfigRequest['rules'][number]['criteriaKey'],
      weight: typeof item.weight === 'number' ? item.weight : item.weight === null ? null : undefined,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      customParams: item.customParams && typeof item.customParams === 'object' && !Array.isArray(item.customParams)
        ? item.customParams as Record<string, unknown>
        : undefined
    }))
  };
}

function normalizePreferenceRulesPatchRequest(body: unknown): PatchSubstitutePreferenceRulesRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  const rules = Array.isArray(value.rules)
    ? value.rules.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  return {
    schoolId: requireText(value.schoolId, 'schoolId'),
    rules: rules.map((item) => ({
      id: hasText(item.id) ? item.id : undefined,
      substituteTeacherId: requireText(item.substituteTeacherId, 'substituteTeacherId'),
      scope: requireText(item.scope, 'scope') as PatchSubstitutePreferenceRulesRequest['rules'][number]['scope'],
      preferenceType: requireText(item.preferenceType, 'preferenceType') as PatchSubstitutePreferenceRulesRequest['rules'][number]['preferenceType'],
      weight: typeof item.weight === 'number' ? item.weight : item.weight === null ? null : undefined,
      scheduleSessionId: hasText(item.scheduleSessionId) ? item.scheduleSessionId : undefined,
      originalTeacherId: hasText(item.originalTeacherId) ? item.originalTeacherId : undefined,
      subjectId: hasText(item.subjectId) ? item.subjectId : undefined,
      gradeLevelId: hasText(item.gradeLevelId) ? item.gradeLevelId : undefined,
      reason: hasText(item.reason) ? item.reason : undefined,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined
    })),
    deleteRuleIds: Array.isArray(value.deleteRuleIds) ? value.deleteRuleIds.filter((item): item is string => typeof item === 'string') : []
  };
}

function normalizeCreateSubstituteAssignmentRequest(body: unknown): CreateSubstituteAssignmentRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  return {
    leaveId: requireText(value.leaveId ?? value.leave_id, 'leaveId'),
    sessionId: requireText(value.sessionId ?? value.session_id, 'sessionId'),
    substituteTeacherId: requireText(value.substituteTeacherId ?? value.substitute_teacher_id, 'substituteTeacherId')
  };
}

function normalizeSubstituteAssignmentStatusRequest(body: unknown): UpdateSubstituteAssignmentStatusRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  const status = requireText(value.status, 'status');
  if (status !== 'accepted' && status !== 'declined' && status !== 'canceled' && status !== 'completed') {
    throw new TimetableValidationError('status must be accepted, declined, canceled, or completed.');
  }
  return {
    status,
    cancellationReason: hasText(value.cancellationReason) ? value.cancellationReason : undefined
  };
}

function normalizeReassignSubstituteAssignmentRequest(body: unknown): ReassignSubstituteAssignmentRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  return {
    substituteTeacherId: requireText(value.substituteTeacherId ?? value.substitute_teacher_id, 'substituteTeacherId'),
    cancellationReason: hasText(value.cancellationReason) ? value.cancellationReason : undefined
  };
}

function normalizeUpdateSessionRequest(body: unknown): UpdateClassSessionRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  const patch: UpdateClassSessionRequest = {};
  for (const key of [
    'timetablePeriodId',
    'subjectId',
    'gradeLevelId',
    'section',
    'roomId',
    'assignedTeacherId',
    'notes'
  ] as const) {
    if (key in value) {
      patch[key] = hasText(value[key]) ? value[key] : undefined;
    }
  }
  if (Array.isArray(value.equipmentResourceIds)) {
    patch.equipmentResourceIds = value.equipmentResourceIds.filter((item): item is string => typeof item === 'string');
  }
  if (['draft', 'published', 'archived', 'cancelled'].includes(String(value.status))) {
    patch.status = value.status as UpdateClassSessionRequest['status'];
  }
  return patch;
}

function normalizeAuditQuery(query: Record<string, unknown>): RosterAuditQuery {
  const rawLimit = Number(query.limit);
  return {
    schoolId: requireText(query.schoolId, 'schoolId'),
    actorUserId: hasText(query.actorUserId) ? query.actorUserId : undefined,
    eventType: hasText(query.eventType) ? query.eventType : undefined,
    objectType: hasText(query.objectType) ? query.objectType : undefined,
    objectId: hasText(query.objectId) ? query.objectId : undefined,
    startDate: hasText(query.startDate) ? query.startDate : undefined,
    endDate: hasText(query.endDate) ? query.endDate : undefined,
    limit: Number.isFinite(rawLimit) ? rawLimit : undefined
  };
}

function normalizeReportQuery(query: Record<string, unknown>, options: { requireTerm?: boolean } = {}): ReportQuery & { termId?: string } {
  const termId = hasText(query.termId) ? query.termId : undefined;
  if (options.requireTerm && !termId) throw new TimetableValidationError('termId is required.');
  return {
    schoolId: requireText(query.schoolId, 'schoolId'),
    termId,
    teacherId: hasText(query.teacherId) ? query.teacherId : undefined,
    startDate: hasText(query.startDate) ? query.startDate : undefined,
    endDate: hasText(query.endDate) ? query.endDate : undefined
  };
}

function normalizeReportType(value: string): ReportExportType {
  if (value === 'workload' || value === 'leave-summary' || value === 'substitute-history' || value === 'coverage-operations') return value;
  throw new TimetableValidationError('report type must be workload, leave-summary, substitute-history, or coverage-operations.');
}

async function getAuthenticatedSession({
  request,
  reply,
  authService
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  authService: StandaloneAuthService;
}) {
  const session = await authService.getSession({ sessionToken: sessionTokenFrom(request) });
  if (!session) {
    return null;
  }
  if (isUnsafeMethod(request.method)) {
    const csrfHeader = request.headers[ROSTER_CSRF_HEADER_NAME];
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    if (!authService.verifyCsrf(session, csrfToken)) {
      throw new TimetableValidationError('A valid CSRF token is required for roster mutations.');
    }
  }
  return session;
}

function handleRosterError(error: unknown, reply: FastifyReply) {
  if (error instanceof TimetableConflictError) {
    return conflict(reply, error.message);
  }
  if (error instanceof TimetableValidationError) {
    return badRequest(reply, error.message);
  }
  if (error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'TimetableValidationError') {
    return badRequest(reply, error instanceof Error ? error.message : 'Roster validation failed.');
  }
  if (error instanceof Error && error.message.includes('substitute offer')) {
    return badRequest(reply, error.message);
  }
  throw error;
}

export function buildRosterApiApp(services: RosterApiServices): FastifyInstance {
  const app = Fastify({ logger: false });
  void app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  });
  const timetableService = createTimetableService(services.timetableRepository);
  const sessionService = createSessionService(services.timetableRepository);
  const calendarService = createCalendarService(services.calendarRepository ?? new InMemoryCalendarRepository());
  const notificationService = createNotificationService(services.notificationRepository ?? new InMemoryNotificationRepository());
  const leaveRepository = services.leaveRepository ?? new InMemoryLeaveRepository();
  const substituteAssignmentRepository = services.substituteAssignmentRepository ?? new InMemorySubstituteAssignmentRepository();
  const availabilityRepository = services.availabilityRepository ?? new InMemoryAvailabilityRepository();
  const ruleConfigRepository = services.ruleConfigRepository ?? new InMemoryRuleConfigRepository();
  const preferenceRuleRepository = services.preferenceRuleRepository ?? new InMemoryPreferenceRuleRepository();
  const substituteRecommendationRepository = services.substituteRecommendationRepository
    ?? new InMemorySubstituteRecommendationRepository(undefined, undefined, [], [], ruleConfigRepository, preferenceRuleRepository);
  const leaveService = createLeaveService({
    leaveRepository,
    timetableRepository: services.timetableRepository,
    calendarService,
    notificationService
  });
  const substituteRecommendationService = createSubstituteRecommendationService({
    timetableRepository: services.timetableRepository,
    leaveRepository,
    availabilityRepository,
    recommendationRepository: substituteRecommendationRepository,
    jobRepository: services.recommendationJobRepository ?? new InMemoryRecommendationJobRepository()
  });
  const availabilityService = createAvailabilityService({
    repository: availabilityRepository,
    timetableRepository: services.timetableRepository
  });
  const ruleConfigService = createRuleConfigService({
    repository: ruleConfigRepository,
    timetableRepository: services.timetableRepository
  });
  const preferenceRuleService = createPreferenceRuleService({
    repository: preferenceRuleRepository,
    timetableRepository: services.timetableRepository
  });
  const substituteAssignmentService = createSubstituteAssignmentService({
    repository: substituteAssignmentRepository,
    leaveRepository,
    timetableRepository: services.timetableRepository,
    notificationService
  });
  const coverageService = createCoverageService({
    leaveRepository,
    timetableRepository: services.timetableRepository
  });
  const reportService = createRosterReportService({
    timetableRepository: services.timetableRepository,
    leaveRepository,
    substituteAssignmentRepository
  });
  const auditService = createRosterAuditService(
    services.auditRepository
      ?? new InMemoryAuditRepository(([
        services.timetableRepository,
        leaveRepository,
        substituteAssignmentRepository
      ].filter(Boolean)) as AuditEventSource[])
  );
  createResourceService(services.resourceRepository ?? new InMemoryResourceRepository());

  app.post('/api/auth/sign-in', async (request, reply) => {
    const body = (request.body ?? {}) as SignInRequest;
    const created = await services.authService.signIn({
      email: body.email,
      password: body.password,
      requestedRole: body.requestedRole
    });
    if (!created) {
      return authError(reply);
    }
    reply.header(
      'set-cookie',
      buildSessionCookies({ sessionToken: created.sessionToken, session: created.session, secure: shouldUseSecureCookie(request) })
    );
    return { session: created.session };
  });

  app.get('/api/auth/session', async (request) => {
    const session = await services.authService.getSession({ sessionToken: sessionTokenFrom(request) });
    return { session };
  });

  app.post('/api/roster/timetables', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const result = await timetableService.createFromDefault({ session, request: normalizeCreateTimetableRequest(request.body) });
      reply.code(201);
      return result;
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/timetables', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      return {
        timetables: await timetableService.list({
          session,
          schoolId: requireText(query.schoolId, 'schoolId'),
          termId: requireText(query.termId, 'termId')
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/timetables/:id', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const timetableId = (request.params as { id: string }).id;
      const timetable = await services.timetableRepository.getTimetable(timetableId);
      if (!timetable) return badRequest(reply, 'Timetable was not found.');
      if (session.activeSchoolId !== timetable.schoolId) {
        return forbidden(reply, 'Cross-school timetable access is not allowed.');
      }
      const periods = await services.timetableRepository.listPeriods(timetable.id);
      const sessions = (await services.timetableRepository.listClassSessions(timetable.schoolId, timetable.termId))
        .filter((item) => item.timetableId === timetable.id);
      return { timetable, periods, sessions };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.patch('/api/roster/timetables/:id/periods', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return await timetableService.updatePeriods({
        session,
        timetableId: (request.params as { id: string }).id,
        periods: normalizeUpdateTimetablePeriodsRequest(request.body).periods
      });
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/timetables/:id/confirm-structure', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return await timetableService.confirmStructure({ session, timetableId: (request.params as { id: string }).id });
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/timetables/:id/publish', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { timetable: await timetableService.publish({ session, timetableId: (request.params as { id: string }).id }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/timetables/:id/unpublish', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const timetable = await services.timetableRepository.getTimetable((request.params as { id: string }).id);
      if (!timetable) return badRequest(reply, 'Timetable was not found.');
      if (timetable.status === 'archived') return badRequest(reply, 'Archived timetables cannot be unpublished.');
      if (session.activeRole !== 'school_admin' || session.activeSchoolId !== timetable.schoolId) {
        return forbidden(reply);
      }
      const timestamp = new Date().toISOString();
      const updated = await services.timetableRepository.updateTimetable({
        ...timetable,
        status: 'draft',
        updatedAt: timestamp,
        publishedAt: undefined
      });
      const sessions = await services.timetableRepository.listClassSessions(updated.schoolId, updated.termId);
      for (const classSession of sessions.filter((item) => item.timetableId === updated.id && item.status === 'published')) {
        await services.timetableRepository.updateClassSession({ ...classSession, status: 'draft', updatedAt: timestamp });
      }
      await services.timetableRepository.appendAudit({
        id: randomUUID(),
        schoolId: updated.schoolId,
        actorUserId: session.user.userId,
        actorRole: session.activeRole,
        action: 'timetable.unpublish',
        entityType: 'timetable',
        entityId: updated.id,
        before: timetable,
        after: updated,
        createdAt: timestamp
      });
      return { timetable: updated };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/sessions', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      reply.code(201);
      return { session: await sessionService.create({ session, request: normalizeCreateSessionRequest(request.body) }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.patch('/api/roster/sessions/:id', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return {
        session: await sessionService.update({
          session,
          sessionId: (request.params as { id: string }).id,
          patch: normalizeUpdateSessionRequest(request.body)
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.delete('/api/roster/sessions/:id', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      await sessionService.delete({ session, sessionId: (request.params as { id: string }).id });
      return { ok: true };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });


  app.post('/api/roster/leave', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const result = await leaveService.apply({ session, ...normalizeCreateLeaveRequest(request.body) });
      reply.code(201);
      return result;
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/leave', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      return {
        leaveRequests: await leaveService.list({
          session,
          schoolId: requireText(query.schoolId, 'schoolId'),
          teacherId: hasText(query.teacherId) ? query.teacherId : undefined,
          status: ['pending', 'approved', 'rejected', 'cancelled'].includes(String(query.status)) ? query.status as never : undefined
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/leave/:id/impacts', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { impacts: await leaveService.listImpacts({ session, leaveRequestId: (request.params as { id: string }).id }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/leave/:id/approve', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { leaveRequest: await leaveService.approve({ session, leaveRequestId: (request.params as { id: string }).id }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/leave/:id/reject', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { leaveRequest: await leaveService.reject({ session, leaveRequestId: (request.params as { id: string }).id }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/leave/:id/cancel', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { leaveRequest: await leaveService.cancel({ session, leaveRequestId: (request.params as { id: string }).id }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.patch('/api/roster/leave/:id/impacts', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { impacts: (await leaveService.adjustImpacts({ session, leaveRequestId: (request.params as { id: string }).id, ...normalizeImpactAdjustmentRequest(request.body) })).impacts };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/schedule-projections', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      const projectionType = query.projectionType;
      if (!['class', 'teacher', 'room', 'equipment'].includes(String(projectionType))) {
        return badRequest(reply, 'projectionType must be class, teacher, room, or equipment.');
      }
      return {
        projection: await timetableService.getProjection({
          session,
          schoolId: requireText(query.schoolId, 'schoolId'),
          termId: requireText(query.termId, 'termId'),
          projectionType: projectionType as ScheduleProjectionType,
          ownerId: requireText(query.ownerId, 'ownerId')
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/availability', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      return {
        availability: await availabilityService.list({
          session,
          schoolId: requireText(query.schoolId, 'schoolId'),
          teacherId: hasText(query.teacherId) ? query.teacherId : undefined,
          startDate: hasText(query.startDate) ? query.startDate : undefined,
          endDate: hasText(query.endDate) ? query.endDate : undefined
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.patch('/api/roster/availability', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return {
        availability: await availabilityService.patch({
          session,
          request: normalizeAvailabilityPatchRequest(request.body)
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/rules', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      return {
        rules: await ruleConfigService.list({
          session,
          schoolId: requireText(query.schoolId, 'schoolId')
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.patch('/api/roster/rules', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return {
        rules: await ruleConfigService.patch({
          session,
          request: normalizeRuleConfigPatchRequest(request.body)
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/preferences', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      return {
        rules: await preferenceRuleService.list({
          session,
          schoolId: requireText(query.schoolId, 'schoolId')
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.patch('/api/roster/preferences', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return {
        rules: await preferenceRuleService.patch({
          session,
          request: normalizePreferenceRulesPatchRequest(request.body)
        })
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/substitutes/recommend', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      const job = await substituteRecommendationService.recommend({
        session,
        leaveId: requireText(query.leave_id ?? query.leaveId, 'leave_id'),
        sessionId: requireText(query.session_id ?? query.sessionId, 'session_id'),
        asyncMode: query.async === 'true' || query.mode === 'async'
      });
      return {
        job_id: job.job_id,
        status: job.status,
        current_step: job.current_step,
        progress: job.progress,
        recommendations: job.result?.recommendations ?? [],
        reason_codes: job.result?.reason_codes ?? []
      };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/substitutes/recommendations/:jobId', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const job = await substituteRecommendationService.getJob({
        session,
        jobId: (request.params as { jobId: string }).jobId
      });
      if (!job) return badRequest(reply, 'Recommendation job was not found.');
      return { job };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/substitutes', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const body = normalizeCreateSubstituteAssignmentRequest(request.body);
      const result = await substituteAssignmentService.createOffer({
        session,
        leaveId: body.leaveId,
        sessionId: body.sessionId,
        substituteTeacherId: body.substituteTeacherId
      });
      reply.code(201);
      return result;
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/substitutes', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      return await substituteAssignmentService.list({
        session,
        schoolId: requireText(query.schoolId, 'schoolId')
      });
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.patch('/api/roster/substitutes/:id/status', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return await substituteAssignmentService.updateStatus({
        session,
        assignmentId: (request.params as { id: string }).id,
        ...normalizeSubstituteAssignmentStatusRequest(request.body)
      });
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.post('/api/roster/substitutes/:id/reassign', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return await substituteAssignmentService.reassign({
        session,
        assignmentId: (request.params as { id: string }).id,
        ...normalizeReassignSubstituteAssignmentRequest(request.body)
      });
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/coverage/unfilled', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = request.query as Record<string, unknown>;
      return await coverageService.listUnfilled({
        session,
        schoolId: requireText(query.schoolId, 'schoolId'),
        termId: hasText(query.termId) ? query.termId : undefined,
        teacherId: hasText(query.teacherId) ? query.teacherId : undefined,
        date: hasText(query.date) ? query.date : undefined
      });
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/audit', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return await auditService.list({
        session,
        query: normalizeAuditQuery(request.query as Record<string, unknown>)
      });
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/reports/workload', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const query = normalizeReportQuery(request.query as Record<string, unknown>, { requireTerm: true });
      return { report: await reportService.workload({ session, query: query as ReportQuery & { termId: string } }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/reports/leave-summary', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { report: await reportService.leaveSummary({ session, query: normalizeReportQuery(request.query as Record<string, unknown>) }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/reports/substitute-history', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { report: await reportService.substituteHistory({ session, query: normalizeReportQuery(request.query as Record<string, unknown>) }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/reports/coverage-operations', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      return { report: await reportService.coverageOperations({ session, query: normalizeReportQuery(request.query as Record<string, unknown>) }) };
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  app.get('/api/roster/reports/:type/export', async (request, reply) => {
    try {
      const session = await getAuthenticatedSession({ request, reply, authService: services.authService });
      if (!session) return authError(reply);
      const type = normalizeReportType((request.params as { type: string }).type);
      const csv = await reportService.exportCsv({
        session,
        type,
        query: normalizeReportQuery(request.query as Record<string, unknown>, { requireTerm: type === 'workload' })
      });
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename=\"${type}.csv\"`);
      return csv;
    } catch (error) {
      return handleRosterError(error, reply);
    }
  });

  return app;
}

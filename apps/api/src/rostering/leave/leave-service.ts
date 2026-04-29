import { randomUUID } from 'node:crypto';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';
import type { RosterAuditEvent, TimetableRepository } from '../timetable/timetable-service.js';
import { TimetableValidationError } from '../timetable/timetable-service.js';
import type { CalendarService } from '../calendar/calendar-service.js';
import type { HalfDayBoundaryConfig } from '../calendar/half-day-config.js';
import type { NotificationService } from '../notifications/notification-service.js';
import { calculateLeaveImpacts, type LeaveDurationType, type LeaveImpactWarningCode } from './leave-impact-calculator.js';

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveImpactCoverageStatus = 'unfilled' | 'assigned' | 'covered' | 'no_coverage_needed' | 'cancelled';
export type LeaveImpactSource = 'system_computed' | 'admin_added' | 'admin_removed';

export type LeaveRequest = {
  id: string;
  schoolId: string;
  teacherId: string;
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  leaveType: string;
  reason?: string;
  coverageRequired: boolean;
  substituteNotes?: string;
  status: LeaveRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdBy: string;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type LeaveSessionImpact = {
  id: string;
  schoolId: string;
  leaveRequestId: string;
  classSessionId: string;
  impactDate: string;
  coverageRequired: boolean;
  coverageStatus: LeaveImpactCoverageStatus;
  status: 'active' | 'inactive';
  source: LeaveImpactSource;
  warningCodes: LeaveImpactWarningCode[];
  adminAdjustmentReason?: string;
  adjustedBy?: string;
  adjustedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type LeaveRepository = {
  createLeaveRequest(request: LeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequest(request: LeaveRequest): Promise<LeaveRequest>;
  getLeaveRequest(id: string): Promise<LeaveRequest | null>;
  listLeaveRequests(schoolId: string, filters?: { teacherId?: string; status?: LeaveRequestStatus }): Promise<LeaveRequest[]>;
  createLeaveImpacts(impacts: LeaveSessionImpact[]): Promise<LeaveSessionImpact[]>;
  updateLeaveImpact(impact: LeaveSessionImpact): Promise<LeaveSessionImpact>;
  getLeaveImpact(id: string): Promise<LeaveSessionImpact | null>;
  listLeaveImpacts(leaveRequestId: string): Promise<LeaveSessionImpact[]>;
  appendAudit(event: RosterAuditEvent): Promise<void>;
};

export class InMemoryLeaveRepository implements LeaveRepository {
  readonly leaveRequests = new Map<string, LeaveRequest>();
  readonly impacts = new Map<string, LeaveSessionImpact>();
  readonly auditEvents: RosterAuditEvent[] = [];

  async createLeaveRequest(request: LeaveRequest): Promise<LeaveRequest> {
    this.leaveRequests.set(request.id, request);
    return request;
  }

  async updateLeaveRequest(request: LeaveRequest): Promise<LeaveRequest> {
    this.leaveRequests.set(request.id, request);
    return request;
  }

  async getLeaveRequest(id: string): Promise<LeaveRequest | null> {
    return this.leaveRequests.get(id) ?? null;
  }

  async listLeaveRequests(schoolId: string, filters: { teacherId?: string; status?: LeaveRequestStatus } = {}): Promise<LeaveRequest[]> {
    return [...this.leaveRequests.values()].filter(
      (request) => request.schoolId === schoolId && (!filters.teacherId || request.teacherId === filters.teacherId) && (!filters.status || request.status === filters.status)
    );
  }

  async createLeaveImpacts(impacts: LeaveSessionImpact[]): Promise<LeaveSessionImpact[]> {
    for (const impact of impacts) {
      const duplicate = [...this.impacts.values()].find(
        (item) => item.leaveRequestId === impact.leaveRequestId && item.classSessionId === impact.classSessionId && item.impactDate === impact.impactDate && item.status === 'active'
      );
      if (duplicate) {
        throw new TimetableValidationError('Duplicate active leave session impact is not allowed.');
      }
      this.impacts.set(impact.id, impact);
    }
    return impacts;
  }

  async updateLeaveImpact(impact: LeaveSessionImpact): Promise<LeaveSessionImpact> {
    this.impacts.set(impact.id, impact);
    return impact;
  }

  async getLeaveImpact(id: string): Promise<LeaveSessionImpact | null> {
    return this.impacts.get(id) ?? null;
  }

  async listLeaveImpacts(leaveRequestId: string): Promise<LeaveSessionImpact[]> {
    return [...this.impacts.values()].filter((impact) => impact.leaveRequestId === leaveRequestId);
  }

  async appendAudit(event: RosterAuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }
}

type LeaveRequestRow = {
  id: string;
  school_id: string;
  teacher_id: string;
  start_date: string | Date;
  end_date: string | Date;
  duration_type: LeaveDurationType;
  leave_type: string;
  reason: string | null;
  coverage_required: boolean;
  substitute_notes: string | null;
  status: LeaveRequestStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_by: string;
  requested_at: Date;
  created_at: Date;
  updated_at: Date;
};

type LeaveImpactRow = {
  id: string;
  school_id: string;
  leave_request_id: string;
  schedule_session_id: string;
  impact_date: string | Date;
  coverage_required: boolean;
  coverage_status: LeaveImpactCoverageStatus;
  status: 'active' | 'inactive';
  source: LeaveImpactSource;
  warning_codes: LeaveImpactWarningCode[];
  admin_adjustment_reason: string | null;
  adjusted_by: string | null;
  adjusted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function dateText(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function dateTimeIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toLeaveRequest(row: LeaveRequestRow): LeaveRequest {
  return {
    id: row.id,
    schoolId: row.school_id,
    teacherId: row.teacher_id,
    startDate: dateText(row.start_date),
    endDate: dateText(row.end_date),
    durationType: row.duration_type,
    leaveType: row.leave_type,
    reason: row.reason ?? undefined,
    coverageRequired: row.coverage_required,
    substituteNotes: row.substitute_notes ?? undefined,
    status: row.status,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ? dateTimeIso(row.reviewed_at) : undefined,
    createdBy: row.created_by,
    requestedAt: dateTimeIso(row.requested_at),
    createdAt: dateTimeIso(row.created_at),
    updatedAt: dateTimeIso(row.updated_at)
  };
}

function toLeaveImpact(row: LeaveImpactRow): LeaveSessionImpact {
  return {
    id: row.id,
    schoolId: row.school_id,
    leaveRequestId: row.leave_request_id,
    classSessionId: row.schedule_session_id,
    impactDate: dateText(row.impact_date),
    coverageRequired: row.coverage_required,
    coverageStatus: row.coverage_status,
    status: row.status,
    source: row.source,
    warningCodes: row.warning_codes ?? [],
    adminAdjustmentReason: row.admin_adjustment_reason ?? undefined,
    adjustedBy: row.adjusted_by ?? undefined,
    adjustedAt: row.adjusted_at ? dateTimeIso(row.adjusted_at) : undefined,
    createdAt: dateTimeIso(row.created_at),
    updatedAt: dateTimeIso(row.updated_at)
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

export class PostgresLeaveRepository implements LeaveRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async createLeaveRequest(request: LeaveRequest): Promise<LeaveRequest> {
    await this.database.query(
      `insert into ${tableRef(this.schema, 'rostering_leave_requests')} (
        id, school_id, teacher_id, start_date, end_date, duration_type, leave_type, reason,
        coverage_required, substitute_notes, status, reviewed_by, reviewed_at, created_by,
        requested_at, created_at, updated_at
      )
      values ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        request.id,
        request.schoolId,
        request.teacherId,
        request.startDate,
        request.endDate,
        request.durationType,
        request.leaveType,
        request.reason ?? null,
        request.coverageRequired,
        request.substituteNotes ?? null,
        request.status,
        request.reviewedBy ?? null,
        request.reviewedAt ?? null,
        request.createdBy,
        request.requestedAt,
        request.createdAt,
        request.updatedAt
      ]
    );
    return request;
  }

  async updateLeaveRequest(request: LeaveRequest): Promise<LeaveRequest> {
    await this.database.query(
      `update ${tableRef(this.schema, 'rostering_leave_requests')}
       set status = $2,
           reviewed_by = $3,
           reviewed_at = $4,
           reason = $5,
           coverage_required = $6,
           substitute_notes = $7,
           updated_at = $8
       where id = $1`,
      [
        request.id,
        request.status,
        request.reviewedBy ?? null,
        request.reviewedAt ?? null,
        request.reason ?? null,
        request.coverageRequired,
        request.substituteNotes ?? null,
        request.updatedAt
      ]
    );
    return request;
  }

  async getLeaveRequest(id: string): Promise<LeaveRequest | null> {
    const result = await this.database.query<LeaveRequestRow>(
      `select id, school_id, teacher_id, start_date::text, end_date::text, duration_type, leave_type,
              reason, coverage_required, substitute_notes, status, reviewed_by, reviewed_at,
              created_by, requested_at, created_at, updated_at
       from ${tableRef(this.schema, 'rostering_leave_requests')}
       where id = $1`,
      [id]
    );
    return result.rows[0] ? toLeaveRequest(result.rows[0]) : null;
  }

  async listLeaveRequests(schoolId: string, filters: { teacherId?: string; status?: LeaveRequestStatus } = {}): Promise<LeaveRequest[]> {
    const result = await this.database.query<LeaveRequestRow>(
      `select id, school_id, teacher_id, start_date::text, end_date::text, duration_type, leave_type,
              reason, coverage_required, substitute_notes, status, reviewed_by, reviewed_at,
              created_by, requested_at, created_at, updated_at
       from ${tableRef(this.schema, 'rostering_leave_requests')}
       where school_id = $1
         and ($2::text is null or teacher_id = $2)
         and ($3::text is null or status = $3)
       order by requested_at desc, id`,
      [schoolId, filters.teacherId ?? null, filters.status ?? null]
    );
    return result.rows.map(toLeaveRequest);
  }

  async createLeaveImpacts(impacts: LeaveSessionImpact[]): Promise<LeaveSessionImpact[]> {
    try {
      for (const impact of impacts) {
        await this.database.query(
          `insert into ${tableRef(this.schema, 'rostering_leave_session_impacts')} (
            id, school_id, leave_request_id, schedule_session_id, impact_date, coverage_required,
            coverage_status, status, source, warning_codes, admin_adjustment_reason,
            adjusted_by, adjusted_at, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10::text[], $11, $12, $13, $14, $15)`,
          [
            impact.id,
            impact.schoolId,
            impact.leaveRequestId,
            impact.classSessionId,
            impact.impactDate,
            impact.coverageRequired,
            impact.coverageStatus,
            impact.status,
            impact.source,
            impact.warningCodes,
            impact.adminAdjustmentReason ?? null,
            impact.adjustedBy ?? null,
            impact.adjustedAt ?? null,
            impact.createdAt,
            impact.updatedAt
          ]
        );
      }
      return impacts;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TimetableValidationError('Duplicate active leave session impact is not allowed.');
      }
      throw error;
    }
  }

  async updateLeaveImpact(impact: LeaveSessionImpact): Promise<LeaveSessionImpact> {
    await this.database.query(
      `update ${tableRef(this.schema, 'rostering_leave_session_impacts')}
       set coverage_required = $2,
           coverage_status = $3,
           status = $4,
           source = $5,
           warning_codes = $6::text[],
           admin_adjustment_reason = $7,
           adjusted_by = $8,
           adjusted_at = $9,
           updated_at = $10
       where id = $1`,
      [
        impact.id,
        impact.coverageRequired,
        impact.coverageStatus,
        impact.status,
        impact.source,
        impact.warningCodes,
        impact.adminAdjustmentReason ?? null,
        impact.adjustedBy ?? null,
        impact.adjustedAt ?? null,
        impact.updatedAt
      ]
    );
    return impact;
  }

  async getLeaveImpact(id: string): Promise<LeaveSessionImpact | null> {
    const result = await this.database.query<LeaveImpactRow>(
      `select id, school_id, leave_request_id, schedule_session_id, impact_date::text, coverage_required,
              coverage_status, status, source, warning_codes, admin_adjustment_reason,
              adjusted_by, adjusted_at, created_at, updated_at
       from ${tableRef(this.schema, 'rostering_leave_session_impacts')}
       where id = $1`,
      [id]
    );
    return result.rows[0] ? toLeaveImpact(result.rows[0]) : null;
  }

  async listLeaveImpacts(leaveRequestId: string): Promise<LeaveSessionImpact[]> {
    const result = await this.database.query<LeaveImpactRow>(
      `select id, school_id, leave_request_id, schedule_session_id, impact_date::text, coverage_required,
              coverage_status, status, source, warning_codes, admin_adjustment_reason,
              adjusted_by, adjusted_at, created_at, updated_at
       from ${tableRef(this.schema, 'rostering_leave_session_impacts')}
       where leave_request_id = $1
       order by impact_date, created_at, id`,
      [leaveRequestId]
    );
    return result.rows.map(toLeaveImpact);
  }

  async appendAudit(event: RosterAuditEvent): Promise<void> {
    await this.database.query(
      `insert into ${tableRef(this.schema, 'audit_events')} (
        id, school_id, actor_user_id, actor_display_name, actor_role, event_type,
        object_type, object_id, message, reason, metadata, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10::jsonb, $11)`,
      [
        event.id,
        event.schoolId,
        event.actorUserId,
        event.actorUserId,
        event.actorRole,
        event.action,
        event.entityType,
        event.entityId,
        event.action,
        JSON.stringify({ before: event.before ?? null, after: event.after ?? null }),
        event.createdAt
      ]
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertSameSchool(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Cross-school leave access is not allowed.');
  }
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  assertSameSchool(session, schoolId);
  if (session.activeRole !== 'school_admin') {
    throw new TimetableValidationError('Only school admins can review leave requests.');
  }
}

function assertTeacherSelfOrAdmin(session: AuthenticatedRosterSession, schoolId: string, teacherId: string): void {
  assertSameSchool(session, schoolId);
  if (session.activeRole === 'school_admin') return;
  if (session.activeRole === 'teacher' && session.actorByRole.teacher === teacherId) return;
  throw new TimetableValidationError('Teachers can only manage their own leave requests.');
}

function assertDuration(durationType: string): asserts durationType is LeaveDurationType {
  if (!['full_day', 'am_half_day', 'pm_half_day'].includes(durationType)) {
    throw new TimetableValidationError('durationType must be full_day, am_half_day, or pm_half_day.');
  }
}

export function createLeaveService({
  leaveRepository,
  timetableRepository,
  calendarService,
  halfDayConfig,
  notificationService
}: {
  leaveRepository: LeaveRepository;
  timetableRepository: Pick<TimetableRepository, 'listTimetables' | 'listPeriods' | 'listClassSessions' | 'getClassSession'>;
  calendarService?: Pick<CalendarService, 'isNoSchoolDate' | 'getExceptionForDate'>;
  halfDayConfig?: HalfDayBoundaryConfig;
  notificationService?: Pick<NotificationService, 'emit'>;
}) {
  return {
    async apply(input: {
      session: AuthenticatedRosterSession;
      schoolId: string;
      teacherId: string;
      termId?: string;
      startDate: string;
      endDate: string;
      durationType: LeaveDurationType;
      leaveType: string;
      reason?: string;
      coverageRequired?: boolean;
      substituteNotes?: string;
      adminCreateReason?: string;
    }): Promise<{ leaveRequest: LeaveRequest; impacts: LeaveSessionImpact[]; warnings: Array<{ code: LeaveImpactWarningCode; classSessionId: string; timetablePeriodId: string; impactDate: string }> }> {
      assertDuration(input.durationType);
      assertTeacherSelfOrAdmin(input.session, input.schoolId, input.teacherId);
      if (!input.leaveType.trim()) {
        throw new TimetableValidationError('leaveType is required.');
      }
      if (input.session.activeRole === 'school_admin' && !input.adminCreateReason?.trim()) {
        throw new TimetableValidationError('adminCreateReason is required when an admin creates leave for a teacher.');
      }
      const timestamp = nowIso();
      const coverageRequired = input.coverageRequired ?? true;
      const leaveRequest: LeaveRequest = {
        id: randomUUID(),
        schoolId: input.schoolId,
        teacherId: input.teacherId,
        startDate: input.startDate,
        endDate: input.endDate,
        durationType: input.durationType,
        leaveType: input.leaveType.trim(),
        reason: input.reason?.trim() || undefined,
        coverageRequired,
        substituteNotes: input.substituteNotes?.trim() || undefined,
        status: 'pending',
        createdBy: input.session.user.userId,
        requestedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const calculated = await calculateLeaveImpacts({
        repository: timetableRepository,
        calendarService,
        schoolId: input.schoolId,
        termId: input.termId ?? 'term-2026-t1',
        teacherId: input.teacherId,
        startDate: input.startDate,
        endDate: input.endDate,
        durationType: input.durationType,
        halfDayConfig
      });
      await leaveRepository.createLeaveRequest(leaveRequest);
      const impacts: LeaveSessionImpact[] = calculated.impacts.map((impact) => ({
        id: randomUUID(),
        schoolId: input.schoolId,
        leaveRequestId: leaveRequest.id,
        classSessionId: impact.classSession.id,
        impactDate: impact.impactDate,
        coverageRequired,
        coverageStatus: coverageRequired ? 'unfilled' : 'no_coverage_needed',
        status: 'active',
        source: 'system_computed',
        warningCodes: impact.warningCodes,
        createdAt: timestamp,
        updatedAt: timestamp
      }));
      await leaveRepository.createLeaveImpacts(impacts);
      await leaveRepository.appendAudit({
        id: randomUUID(),
        schoolId: input.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'leave.apply',
        entityType: 'leave_request',
        entityId: leaveRequest.id,
        after: { leaveRequest, impacts, adminCreateReason: input.adminCreateReason?.trim() },
        createdAt: timestamp
      });
      await notificationService?.emit({
        schoolId: input.schoolId,
        recipientRole: 'school_admin',
        eventType: 'leave.applied',
        title: 'Leave request submitted',
        body: `${input.teacherId} requested ${input.durationType.replaceAll('_', ' ')} leave from ${input.startDate} to ${input.endDate}.`,
        deepLink: `/rostering/leave/${leaveRequest.id}`,
        entityType: 'leave_request',
        entityId: leaveRequest.id
      });
      return { leaveRequest, impacts, warnings: calculated.warnings };
    },

    async approve(input: { session: AuthenticatedRosterSession; leaveRequestId: string }): Promise<LeaveRequest> {
      const existing = await leaveRepository.getLeaveRequest(input.leaveRequestId);
      if (!existing) throw new TimetableValidationError('Leave request was not found.');
      assertAdmin(input.session, existing.schoolId);
      if (existing.status !== 'pending') throw new TimetableValidationError('Only pending leave requests can be approved.');
      const timestamp = nowIso();
      const updated: LeaveRequest = { ...existing, status: 'approved', reviewedBy: input.session.user.userId, reviewedAt: timestamp, updatedAt: timestamp };
      await leaveRepository.updateLeaveRequest(updated);
      await leaveRepository.appendAudit({ id: randomUUID(), schoolId: updated.schoolId, actorUserId: input.session.user.userId, actorRole: input.session.activeRole, action: 'leave.approve', entityType: 'leave_request', entityId: updated.id, before: existing, after: updated, createdAt: timestamp });
      await notificationService?.emit({
        schoolId: updated.schoolId,
        recipientRole: 'teacher',
        recipientActorId: updated.teacherId,
        eventType: 'leave.approved',
        title: 'Leave request approved',
        body: `Your ${updated.durationType.replaceAll('_', ' ')} leave from ${updated.startDate} to ${updated.endDate} was approved.`,
        deepLink: `/rostering/leave/${updated.id}`,
        entityType: 'leave_request',
        entityId: updated.id
      });
      return updated;
    },

    async reject(input: { session: AuthenticatedRosterSession; leaveRequestId: string }): Promise<LeaveRequest> {
      const existing = await leaveRepository.getLeaveRequest(input.leaveRequestId);
      if (!existing) throw new TimetableValidationError('Leave request was not found.');
      assertAdmin(input.session, existing.schoolId);
      if (existing.status !== 'pending') throw new TimetableValidationError('Only pending leave requests can be rejected.');
      const timestamp = nowIso();
      const updated: LeaveRequest = { ...existing, status: 'rejected', reviewedBy: input.session.user.userId, reviewedAt: timestamp, updatedAt: timestamp };
      const beforeImpacts = await leaveRepository.listLeaveImpacts(existing.id);
      for (const impact of beforeImpacts.filter((item) => item.status === 'active')) {
        await leaveRepository.updateLeaveImpact({
          ...impact,
          status: 'inactive',
          coverageStatus: 'cancelled',
          adjustedBy: input.session.user.userId,
          adjustedAt: timestamp,
          updatedAt: timestamp
        });
      }
      const afterImpacts = await leaveRepository.listLeaveImpacts(existing.id);
      await leaveRepository.updateLeaveRequest(updated);
      await leaveRepository.appendAudit({ id: randomUUID(), schoolId: updated.schoolId, actorUserId: input.session.user.userId, actorRole: input.session.activeRole, action: 'leave.reject', entityType: 'leave_request', entityId: updated.id, before: { leaveRequest: existing, impacts: beforeImpacts }, after: { leaveRequest: updated, impacts: afterImpacts }, createdAt: timestamp });
      await notificationService?.emit({
        schoolId: updated.schoolId,
        recipientRole: 'teacher',
        recipientActorId: updated.teacherId,
        eventType: 'leave.rejected',
        title: 'Leave request rejected',
        body: `Your ${updated.durationType.replaceAll('_', ' ')} leave from ${updated.startDate} to ${updated.endDate} was rejected.`,
        deepLink: `/rostering/leave/${updated.id}`,
        entityType: 'leave_request',
        entityId: updated.id
      });
      return updated;
    },

    async cancel(input: { session: AuthenticatedRosterSession; leaveRequestId: string }): Promise<LeaveRequest> {
      const existing = await leaveRepository.getLeaveRequest(input.leaveRequestId);
      if (!existing) throw new TimetableValidationError('Leave request was not found.');
      assertTeacherSelfOrAdmin(input.session, existing.schoolId, existing.teacherId);
      if (existing.status !== 'pending') throw new TimetableValidationError('Only pending leave requests can be cancelled.');
      const timestamp = nowIso();
      const updated: LeaveRequest = { ...existing, status: 'cancelled', updatedAt: timestamp };
      const beforeImpacts = await leaveRepository.listLeaveImpacts(existing.id);
      for (const impact of beforeImpacts.filter((item) => item.status === 'active')) {
        await leaveRepository.updateLeaveImpact({
          ...impact,
          status: 'inactive',
          coverageStatus: 'cancelled',
          adjustedBy: input.session.user.userId,
          adjustedAt: timestamp,
          updatedAt: timestamp
        });
      }
      const afterImpacts = await leaveRepository.listLeaveImpacts(existing.id);
      await leaveRepository.updateLeaveRequest(updated);
      await leaveRepository.appendAudit({ id: randomUUID(), schoolId: updated.schoolId, actorUserId: input.session.user.userId, actorRole: input.session.activeRole, action: 'leave.cancel', entityType: 'leave_request', entityId: updated.id, before: { leaveRequest: existing, impacts: beforeImpacts }, after: { leaveRequest: updated, impacts: afterImpacts }, createdAt: timestamp });
      await notificationService?.emit({
        schoolId: updated.schoolId,
        recipientRole: 'school_admin',
        eventType: 'leave.cancelled',
        title: 'Leave request cancelled',
        body: `${updated.teacherId} cancelled ${updated.durationType.replaceAll('_', ' ')} leave from ${updated.startDate} to ${updated.endDate}.`,
        deepLink: `/rostering/leave/${updated.id}`,
        entityType: 'leave_request',
        entityId: updated.id
      });
      return updated;
    },

    async list(input: { session: AuthenticatedRosterSession; schoolId: string; teacherId?: string; status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
      assertSameSchool(input.session, input.schoolId);
      if (input.session.activeRole === 'teacher') {
        const teacherId = input.session.actorByRole.teacher;
        return leaveRepository.listLeaveRequests(input.schoolId, { teacherId, status: input.status });
      }
      return leaveRepository.listLeaveRequests(input.schoolId, { teacherId: input.teacherId, status: input.status });
    },

    async listImpacts(input: { session: AuthenticatedRosterSession; leaveRequestId: string }): Promise<LeaveSessionImpact[]> {
      const request = await leaveRepository.getLeaveRequest(input.leaveRequestId);
      if (!request) throw new TimetableValidationError('Leave request was not found.');
      assertTeacherSelfOrAdmin(input.session, request.schoolId, request.teacherId);
      return leaveRepository.listLeaveImpacts(input.leaveRequestId);
    },

    async adjustImpacts(input: {
      session: AuthenticatedRosterSession;
      leaveRequestId: string;
      adjustmentReason: string;
      add?: Array<{ classSessionId: string; impactDate: string; coverageRequired?: boolean }>;
      removeImpactIds?: string[];
      updateCoverage?: Array<{ impactId: string; coverageRequired: boolean }>;
    }): Promise<{ impacts: LeaveSessionImpact[] }> {
      const request = await leaveRepository.getLeaveRequest(input.leaveRequestId);
      if (!request) throw new TimetableValidationError('Leave request was not found.');
      assertAdmin(input.session, request.schoolId);
      if (!input.adjustmentReason.trim()) {
        throw new TimetableValidationError('admin_adjustment_reason is required.');
      }
      if (request.status === 'rejected' || request.status === 'cancelled') {
        throw new TimetableValidationError('Rejected or cancelled leave impacts cannot be adjusted.');
      }
      const timestamp = nowIso();
      const before = await leaveRepository.listLeaveImpacts(request.id);

      for (const item of input.add ?? []) {
        const classSession = await timetableRepository.getClassSession(item.classSessionId);
        if (!classSession || classSession.schoolId !== request.schoolId) {
          throw new TimetableValidationError('Class session for impact adjustment was not found.');
        }
        const coverageRequired = item.coverageRequired ?? request.coverageRequired;
        await leaveRepository.createLeaveImpacts([{
          id: randomUUID(),
          schoolId: request.schoolId,
          leaveRequestId: request.id,
          classSessionId: item.classSessionId,
          impactDate: item.impactDate,
          coverageRequired,
          coverageStatus: coverageRequired ? 'unfilled' : 'no_coverage_needed',
          status: 'active',
          source: 'admin_added',
          warningCodes: [],
          adminAdjustmentReason: input.adjustmentReason.trim(),
          adjustedBy: input.session.user.userId,
          adjustedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        }]);
      }

      for (const impactId of input.removeImpactIds ?? []) {
        const existing = await leaveRepository.getLeaveImpact(impactId);
        if (!existing || existing.leaveRequestId !== request.id) throw new TimetableValidationError('Leave impact was not found.');
        await leaveRepository.updateLeaveImpact({
          ...existing,
          status: 'inactive',
          source: 'admin_removed',
          coverageStatus: 'cancelled',
          adminAdjustmentReason: input.adjustmentReason.trim(),
          adjustedBy: input.session.user.userId,
          adjustedAt: timestamp,
          updatedAt: timestamp
        });
      }

      for (const item of input.updateCoverage ?? []) {
        const existing = await leaveRepository.getLeaveImpact(item.impactId);
        if (!existing || existing.leaveRequestId !== request.id) throw new TimetableValidationError('Leave impact was not found.');
        await leaveRepository.updateLeaveImpact({
          ...existing,
          coverageRequired: item.coverageRequired,
          coverageStatus: item.coverageRequired ? 'unfilled' : 'no_coverage_needed',
          adminAdjustmentReason: input.adjustmentReason.trim(),
          adjustedBy: input.session.user.userId,
          adjustedAt: timestamp,
          updatedAt: timestamp
        });
      }

      const impacts = await leaveRepository.listLeaveImpacts(request.id);
      await leaveRepository.appendAudit({
        id: randomUUID(),
        schoolId: request.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'leave.impacts.adjust',
        entityType: 'leave_request',
        entityId: request.id,
        before,
        after: impacts,
        createdAt: timestamp
      });
      return { impacts };
    }
  };
}

export type LeaveService = ReturnType<typeof createLeaveService>;

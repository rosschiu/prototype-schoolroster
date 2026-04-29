import { randomUUID } from 'node:crypto';
import type { SubstituteAssignment, SubstituteAssignmentStatus } from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';
import type { LeaveRepository } from '../leave/leave-service.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { RosterAuditEvent, TimetableRepository } from '../timetable/timetable-service.js';
import { TimetableConflictError, TimetableValidationError } from '../timetable/timetable-service.js';

type AssignmentRow = {
  id: string;
  school_id: string;
  leave_request_id: string;
  schedule_session_id: string;
  original_teacher_id: string;
  substitute_teacher_id: string;
  assigned_by: string;
  assigned_at: Date | string;
  status: SubstituteAssignmentStatus;
  acknowledged_at: Date | null;
  accepted_at: Date | null;
  declined_at: Date | null;
  completed_at: Date | null;
  canceled_at: Date | null;
  cancellation_reason: string | null;
};

export type SubstituteAssignmentRepository = {
  create(assignment: SubstituteAssignment): Promise<SubstituteAssignment>;
  update(assignment: SubstituteAssignment): Promise<SubstituteAssignment>;
  get(id: string): Promise<SubstituteAssignment | null>;
  listForLeave(leaveRequestId: string): Promise<SubstituteAssignment[]>;
  listForSchool(schoolId: string): Promise<SubstituteAssignment[]>;
  listForTeacher(schoolId: string, teacherId: string): Promise<SubstituteAssignment[]>;
  appendAudit(event: RosterAuditEvent): Promise<void>;
};

function dateTimeIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toAssignment(row: AssignmentRow): SubstituteAssignment {
  return {
    id: row.id,
    schoolId: row.school_id,
    leaveRequestId: row.leave_request_id,
    classSessionId: row.schedule_session_id,
    originalTeacherId: row.original_teacher_id,
    substituteTeacherId: row.substitute_teacher_id,
    assignedBy: row.assigned_by,
    assignedAt: dateTimeIso(row.assigned_at),
    status: row.status,
    acknowledgedAt: row.acknowledged_at ? dateTimeIso(row.acknowledged_at) : undefined,
    acceptedAt: row.accepted_at ? dateTimeIso(row.accepted_at) : undefined,
    declinedAt: row.declined_at ? dateTimeIso(row.declined_at) : undefined,
    completedAt: row.completed_at ? dateTimeIso(row.completed_at) : undefined,
    canceledAt: row.canceled_at ? dateTimeIso(row.canceled_at) : undefined,
    cancellationReason: row.cancellation_reason ?? undefined
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

export class InMemorySubstituteAssignmentRepository implements SubstituteAssignmentRepository {
  readonly assignments = new Map<string, SubstituteAssignment>();
  readonly auditEvents: RosterAuditEvent[] = [];

  async create(assignment: SubstituteAssignment): Promise<SubstituteAssignment> {
    const duplicate = [...this.assignments.values()].find(
      (item) =>
        item.schoolId === assignment.schoolId &&
        item.substituteTeacherId === assignment.substituteTeacherId &&
        item.classSessionId === assignment.classSessionId &&
        ['assigned', 'offered', 'acknowledged', 'accepted'].includes(item.status)
    );
    if (duplicate) throw new TimetableConflictError('Substitute already has active coverage for this session.');
    this.assignments.set(assignment.id, assignment);
    return assignment;
  }

  async update(assignment: SubstituteAssignment): Promise<SubstituteAssignment> {
    this.assignments.set(assignment.id, assignment);
    return assignment;
  }

  async get(id: string): Promise<SubstituteAssignment | null> {
    return this.assignments.get(id) ?? null;
  }

  async listForLeave(leaveRequestId: string): Promise<SubstituteAssignment[]> {
    return [...this.assignments.values()].filter((item) => item.leaveRequestId === leaveRequestId);
  }

  async listForSchool(schoolId: string): Promise<SubstituteAssignment[]> {
    return [...this.assignments.values()].filter((item) => item.schoolId === schoolId);
  }

  async listForTeacher(schoolId: string, teacherId: string): Promise<SubstituteAssignment[]> {
    return [...this.assignments.values()].filter((item) => item.schoolId === schoolId && item.substituteTeacherId === teacherId);
  }

  async appendAudit(event: RosterAuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }
}

export class PostgresSubstituteAssignmentRepository implements SubstituteAssignmentRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async create(assignment: SubstituteAssignment): Promise<SubstituteAssignment> {
    try {
      await this.database.query(
        `insert into ${tableRef(this.schema, 'rostering_substitute_assignments')} (
          id, school_id, leave_request_id, schedule_session_id, original_teacher_id,
          substitute_teacher_id, assigned_by, assigned_at, status, acknowledged_at,
          accepted_at, declined_at, completed_at, canceled_at, cancellation_reason
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, null, null, null, null, null)`,
        [
          assignment.id,
          assignment.schoolId,
          assignment.leaveRequestId,
          assignment.classSessionId,
          assignment.originalTeacherId,
          assignment.substituteTeacherId,
          assignment.assignedBy,
          assignment.assignedAt,
          assignment.status
        ]
      );
      return assignment;
    } catch (error) {
      if (isUniqueViolation(error)) throw new TimetableConflictError('Substitute already has active coverage for this session.');
      throw error;
    }
  }

  async update(assignment: SubstituteAssignment): Promise<SubstituteAssignment> {
    await this.database.query(
      `update ${tableRef(this.schema, 'rostering_substitute_assignments')}
       set status = $2,
           acknowledged_at = $3,
           accepted_at = $4,
           declined_at = $5,
           completed_at = $6,
           canceled_at = $7,
           cancellation_reason = $8
       where id = $1`,
      [
        assignment.id,
        assignment.status,
        assignment.acknowledgedAt ?? null,
        assignment.acceptedAt ?? null,
        assignment.declinedAt ?? null,
        assignment.completedAt ?? null,
        assignment.canceledAt ?? null,
        assignment.cancellationReason ?? null
      ]
    );
    return assignment;
  }

  async get(id: string): Promise<SubstituteAssignment | null> {
    const result = await this.database.query<AssignmentRow>(
      `select id, school_id, leave_request_id, schedule_session_id, original_teacher_id,
              substitute_teacher_id, assigned_by, assigned_at, status, acknowledged_at,
              accepted_at, declined_at, completed_at, canceled_at, cancellation_reason
       from ${tableRef(this.schema, 'rostering_substitute_assignments')}
       where id = $1`,
      [id]
    );
    return result.rows[0] ? toAssignment(result.rows[0]) : null;
  }

  async listForLeave(leaveRequestId: string): Promise<SubstituteAssignment[]> {
    const result = await this.database.query<AssignmentRow>(
      `select id, school_id, leave_request_id, schedule_session_id, original_teacher_id,
              substitute_teacher_id, assigned_by, assigned_at, status, acknowledged_at,
              accepted_at, declined_at, completed_at, canceled_at, cancellation_reason
       from ${tableRef(this.schema, 'rostering_substitute_assignments')}
       where leave_request_id = $1
       order by assigned_at, id`,
      [leaveRequestId]
    );
    return result.rows.map(toAssignment);
  }

  async listForSchool(schoolId: string): Promise<SubstituteAssignment[]> {
    const result = await this.database.query<AssignmentRow>(
      `select id, school_id, leave_request_id, schedule_session_id, original_teacher_id,
              substitute_teacher_id, assigned_by, assigned_at, status, acknowledged_at,
              accepted_at, declined_at, completed_at, canceled_at, cancellation_reason
       from ${tableRef(this.schema, 'rostering_substitute_assignments')}
       where school_id = $1
       order by assigned_at desc, id`,
      [schoolId]
    );
    return result.rows.map(toAssignment);
  }

  async listForTeacher(schoolId: string, teacherId: string): Promise<SubstituteAssignment[]> {
    const result = await this.database.query<AssignmentRow>(
      `select id, school_id, leave_request_id, schedule_session_id, original_teacher_id,
              substitute_teacher_id, assigned_by, assigned_at, status, acknowledged_at,
              accepted_at, declined_at, completed_at, canceled_at, cancellation_reason
       from ${tableRef(this.schema, 'rostering_substitute_assignments')}
       where school_id = $1 and substitute_teacher_id = $2
       order by assigned_at desc, id`,
      [schoolId, teacherId]
    );
    return result.rows.map(toAssignment);
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

function assertAdmin(session: AuthenticatedRosterSession): void {
  if (session.activeRole !== 'school_admin') {
    throw new TimetableValidationError('Only school admins can manage substitute assignments.');
  }
}

function activeCoverageStatus(status: SubstituteAssignmentStatus): boolean {
  return status === 'assigned' || status === 'offered' || status === 'acknowledged' || status === 'accepted';
}

export function createSubstituteAssignmentService(input: {
  repository: SubstituteAssignmentRepository;
  leaveRepository: LeaveRepository;
  timetableRepository: TimetableRepository;
  notificationService: NotificationService;
}) {
  return {
    async list(request: {
      session: AuthenticatedRosterSession;
      schoolId: string;
    }): Promise<{ assignments: SubstituteAssignment[] }> {
      if (request.session.activeSchoolId !== request.schoolId) {
        throw new TimetableValidationError('Cross-school substitute assignment access is not allowed.');
      }
      if (request.session.activeRole === 'school_admin') {
        return { assignments: await input.repository.listForSchool(request.schoolId) };
      }
      if (request.session.activeRole !== 'teacher') {
        throw new TimetableValidationError('Only teachers or school admins can view substitute assignments.');
      }
      const teacherId = request.session.actorByRole.teacher;
      if (!teacherId) throw new TimetableValidationError('Teacher actor is required.');
      return { assignments: await input.repository.listForTeacher(request.schoolId, teacherId) };
    },

    async createOffer(request: {
      session: AuthenticatedRosterSession;
      leaveId: string;
      sessionId: string;
      substituteTeacherId: string;
    }): Promise<{ assignment: SubstituteAssignment; assignments: SubstituteAssignment[] }> {
      assertAdmin(request.session);
      const leave = await input.leaveRepository.getLeaveRequest(request.leaveId);
      if (!leave) throw new TimetableValidationError('Leave request was not found.');
      if (leave.schoolId !== request.session.activeSchoolId) throw new TimetableValidationError('Cross-school substitute assignment is not allowed.');
      const classSession = await input.timetableRepository.getClassSession(request.sessionId);
      if (!classSession || classSession.schoolId !== leave.schoolId) throw new TimetableValidationError('Class session was not found for this leave request.');
      if (request.substituteTeacherId === leave.teacherId) throw new TimetableValidationError('Original teacher cannot be assigned as substitute.');
      const impacts = await input.leaveRepository.listLeaveImpacts(leave.id);
      const impact = impacts.find(
        (item) => item.classSessionId === request.sessionId && item.status === 'active' && item.coverageRequired
      );
      if (!impact) throw new TimetableValidationError('No active coverage-required impact exists for this session.');
      if (impact.coverageStatus === 'cancelled' || impact.coverageStatus === 'no_coverage_needed') {
        throw new TimetableValidationError('Impact does not require substitute coverage.');
      }

      const timestamp = new Date().toISOString();
      const assignment: SubstituteAssignment = {
        id: randomUUID(),
        schoolId: leave.schoolId,
        leaveRequestId: leave.id,
        classSessionId: classSession.id,
        originalTeacherId: leave.teacherId,
        substituteTeacherId: request.substituteTeacherId,
        assignedBy: request.session.user.userId,
        assignedAt: timestamp,
        status: 'offered'
      };
      const created = await input.repository.create(assignment);
      await input.leaveRepository.updateLeaveImpact({ ...impact, coverageStatus: 'assigned', updatedAt: timestamp });
      await input.repository.appendAudit({
        id: randomUUID(),
        schoolId: leave.schoolId,
        actorUserId: request.session.user.userId,
        actorRole: request.session.activeRole,
        action: 'substitute.offer.created',
        entityType: 'substitute_assignment',
        entityId: created.id,
        before: null,
        after: created,
        createdAt: timestamp
      });
      await input.notificationService.emit({
        schoolId: leave.schoolId,
        recipientRole: 'teacher',
        recipientActorId: request.substituteTeacherId,
        eventType: 'substitute.offered',
        title: 'Substitute coverage offer',
        body: `You have a substitute coverage offer for ${classSession.subjectId} ${classSession.gradeLevelId}${classSession.section}.`,
        deepLink: `/rostering/substitutes/${created.id}`,
        entityType: 'substitute_assignment',
        entityId: created.id
      });
      return { assignment: created, assignments: await input.repository.listForLeave(leave.id) };
    },

    async updateStatus(request: {
      session: AuthenticatedRosterSession;
      assignmentId: string;
      status: 'accepted' | 'declined' | 'canceled' | 'completed';
      cancellationReason?: string;
    }): Promise<{ assignment: SubstituteAssignment }> {
      const assignment = await input.repository.get(request.assignmentId);
      if (!assignment) throw new TimetableValidationError('Substitute assignment was not found.');
      if (assignment.schoolId !== request.session.activeSchoolId) {
        throw new TimetableValidationError('Cross-school substitute assignment access is not allowed.');
      }
      if (request.status === 'accepted' || request.status === 'declined') {
        return this.respond({ session: request.session, assignment, status: request.status });
      }
      return this.adminTransition({
        session: request.session,
        assignment,
        status: request.status,
        cancellationReason: request.cancellationReason
      });
    },

    async respond(request: {
      session: AuthenticatedRosterSession;
      assignment: SubstituteAssignment;
      status: 'accepted' | 'declined';
    }): Promise<{ assignment: SubstituteAssignment }> {
      if (request.session.activeRole !== 'teacher') {
        throw new TimetableValidationError('Only teachers can respond to substitute offers.');
      }
      const teacherId = request.session.actorByRole.teacher;
      if (!teacherId) throw new TimetableValidationError('Teacher actor is required.');
      const assignment = request.assignment;
      if (assignment.substituteTeacherId !== teacherId) {
        throw new TimetableValidationError('Teachers can only respond to their own substitute offers.');
      }
      if (assignment.status !== 'offered' && assignment.status !== 'acknowledged') {
        throw new TimetableValidationError('Only offered substitute assignments can be accepted or declined.');
      }
      const timestamp = new Date().toISOString();
      const updated: SubstituteAssignment = {
        ...assignment,
        status: request.status,
        acceptedAt: request.status === 'accepted' ? timestamp : assignment.acceptedAt,
        declinedAt: request.status === 'declined' ? timestamp : assignment.declinedAt
      };
      const saved = await input.repository.update(updated);
      const impacts = await input.leaveRepository.listLeaveImpacts(saved.leaveRequestId);
      const impact = impacts.find((item) => item.classSessionId === saved.classSessionId && item.status === 'active');
      if (impact) {
        await input.leaveRepository.updateLeaveImpact({
          ...impact,
          coverageStatus: request.status === 'accepted' ? 'covered' : 'unfilled',
          updatedAt: timestamp
        });
      }
      await input.repository.appendAudit({
        id: randomUUID(),
        schoolId: saved.schoolId,
        actorUserId: request.session.user.userId,
        actorRole: request.session.activeRole,
        action: request.status === 'accepted' ? 'substitute.offer.accepted' : 'substitute.offer.declined',
        entityType: 'substitute_assignment',
        entityId: saved.id,
        before: assignment,
        after: saved,
        createdAt: timestamp
      });
      await input.notificationService.emit({
        schoolId: saved.schoolId,
        recipientRole: 'school_admin',
        eventType: request.status === 'accepted' ? 'substitute.accepted' : 'substitute.declined',
        title: request.status === 'accepted' ? 'Substitute offer accepted' : 'Substitute offer declined',
        body: `Substitute ${teacherId} ${request.status} assignment ${saved.id}.`,
        deepLink: `/rostering/substitutes/${saved.id}`,
        entityType: 'substitute_assignment',
        entityId: saved.id
      });
      return { assignment: saved };
    },

    async adminTransition(request: {
      session: AuthenticatedRosterSession;
      assignment: SubstituteAssignment;
      status: 'canceled' | 'completed';
      cancellationReason?: string;
    }): Promise<{ assignment: SubstituteAssignment }> {
      assertAdmin(request.session);
      const assignment = request.assignment;
      if (!activeCoverageStatus(assignment.status)) {
        throw new TimetableValidationError('Only active substitute assignments can be canceled or completed.');
      }
      if (request.status === 'completed' && assignment.status !== 'accepted' && assignment.status !== 'assigned') {
        throw new TimetableValidationError('Only accepted or assigned substitute assignments can be completed.');
      }
      if (request.status === 'canceled' && !request.cancellationReason?.trim()) {
        throw new TimetableValidationError('Cancellation reason is required.');
      }
      const timestamp = new Date().toISOString();
      const updated: SubstituteAssignment = {
        ...assignment,
        status: request.status,
        completedAt: request.status === 'completed' ? timestamp : assignment.completedAt,
        canceledAt: request.status === 'canceled' ? timestamp : assignment.canceledAt,
        cancellationReason: request.status === 'canceled' ? request.cancellationReason : assignment.cancellationReason
      };
      const saved = await input.repository.update(updated);
      const impacts = await input.leaveRepository.listLeaveImpacts(saved.leaveRequestId);
      const impact = impacts.find((item) => item.classSessionId === saved.classSessionId && item.status === 'active');
      if (impact) {
        await input.leaveRepository.updateLeaveImpact({
          ...impact,
          coverageStatus: request.status === 'completed' ? 'covered' : 'unfilled',
          updatedAt: timestamp
        });
      }
      await input.repository.appendAudit({
        id: randomUUID(),
        schoolId: saved.schoolId,
        actorUserId: request.session.user.userId,
        actorRole: request.session.activeRole,
        action: request.status === 'completed' ? 'substitute.assignment.completed' : 'substitute.assignment.canceled',
        entityType: 'substitute_assignment',
        entityId: saved.id,
        before: assignment,
        after: saved,
        createdAt: timestamp
      });
      await input.notificationService.emit({
        schoolId: saved.schoolId,
        recipientRole: 'teacher',
        recipientActorId: saved.substituteTeacherId,
        eventType: request.status === 'completed' ? 'substitute.completed' : 'substitute.canceled',
        title: request.status === 'completed' ? 'Substitute assignment completed' : 'Substitute assignment canceled',
        body: request.status === 'completed'
          ? `Substitute assignment ${saved.id} was marked completed.`
          : `Substitute assignment ${saved.id} was canceled.`,
        deepLink: `/rostering/substitutes/${saved.id}`,
        entityType: 'substitute_assignment',
        entityId: saved.id
      });
      return { assignment: saved };
    },

    async reassign(request: {
      session: AuthenticatedRosterSession;
      assignmentId: string;
      substituteTeacherId: string;
      cancellationReason?: string;
    }): Promise<{ previousAssignment: SubstituteAssignment; assignment: SubstituteAssignment; assignments: SubstituteAssignment[] }> {
      assertAdmin(request.session);
      const assignment = await input.repository.get(request.assignmentId);
      if (!assignment) throw new TimetableValidationError('Substitute assignment was not found.');
      if (assignment.schoolId !== request.session.activeSchoolId) {
        throw new TimetableValidationError('Cross-school substitute assignment access is not allowed.');
      }
      if (assignment.status === 'completed') {
        throw new TimetableValidationError('Completed substitute assignments cannot be reassigned.');
      }
      if (request.substituteTeacherId === assignment.originalTeacherId) {
        throw new TimetableValidationError('Original teacher cannot be assigned as substitute.');
      }
      const timestamp = new Date().toISOString();
      const previous = assignment.status === 'canceled' || assignment.status === 'declined'
        ? assignment
        : await input.repository.update({
          ...assignment,
          status: 'canceled',
          canceledAt: timestamp,
          cancellationReason: request.cancellationReason ?? 'Reassigned to another substitute.'
        });
      if (previous !== assignment) {
        await input.repository.appendAudit({
          id: randomUUID(),
          schoolId: previous.schoolId,
          actorUserId: request.session.user.userId,
          actorRole: request.session.activeRole,
          action: 'substitute.assignment.reassigned.previous_canceled',
          entityType: 'substitute_assignment',
          entityId: previous.id,
          before: assignment,
          after: previous,
          createdAt: timestamp
        });
        await input.notificationService.emit({
          schoolId: previous.schoolId,
          recipientRole: 'teacher',
          recipientActorId: previous.substituteTeacherId,
          eventType: 'substitute.canceled',
          title: 'Substitute assignment reassigned',
          body: `Substitute assignment ${previous.id} was reassigned.`,
          deepLink: `/rostering/substitutes/${previous.id}`,
          entityType: 'substitute_assignment',
          entityId: previous.id
        });
      }
      const created = await this.createOffer({
        session: request.session,
        leaveId: assignment.leaveRequestId,
        sessionId: assignment.classSessionId,
        substituteTeacherId: request.substituteTeacherId
      });
      await input.repository.appendAudit({
        id: randomUUID(),
        schoolId: created.assignment.schoolId,
        actorUserId: request.session.user.userId,
        actorRole: request.session.activeRole,
        action: 'substitute.assignment.reassigned',
        entityType: 'substitute_assignment',
        entityId: created.assignment.id,
        before: previous,
        after: created.assignment,
        createdAt: new Date().toISOString()
      });
      return {
        previousAssignment: previous,
        assignment: created.assignment,
        assignments: created.assignments
      };
    }
  };
}

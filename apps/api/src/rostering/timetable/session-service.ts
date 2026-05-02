import { randomUUID } from 'node:crypto';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import type { ClassSession, TimetableRepository } from './timetable-service.js';
import { TimetableConflictError, TimetableValidationError } from './timetable-service.js';

export type SessionConflictCode = 'teacher_double_booked' | 'room_double_booked' | 'session_not_found';

export type SessionConflict = {
  code: SessionConflictCode;
  message: string;
  conflictingSessionId?: string;
};

export type CreateSessionRequest = Omit<ClassSession, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  id?: string;
  status?: ClassSession['status'];
};

export type UpdateSessionRequest = Partial<
  Pick<
    ClassSession,
    | 'timetablePeriodId'
    | 'subjectId'
    | 'gradeLevelId'
    | 'section'
    | 'roomId'
    | 'assignedTeacherId'
    | 'equipmentResourceIds'
    | 'status'
    | 'notes'
  >
>;

const activeStatuses = new Set<ClassSession['status']>(['draft', 'published']);

function nowIso(): string {
  return new Date().toISOString();
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin') {
    throw new TimetableValidationError('Only school admins can mutate class sessions.');
  }
  if (session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Cross-school session access is not allowed.');
  }
}

function conflictError(conflict: SessionConflict): TimetableConflictError {
  return new TimetableConflictError(`${conflict.code}: ${conflict.message}`);
}

export async function detectSessionConflicts({
  repository,
  candidate,
  ignoreSessionId
}: {
  repository: Pick<TimetableRepository, 'listClassSessions'>;
  candidate: ClassSession;
  ignoreSessionId?: string;
}): Promise<SessionConflict[]> {
  if (!activeStatuses.has(candidate.status)) {
    return [];
  }

  const sessions = await repository.listClassSessions(candidate.schoolId, candidate.termId);
  const conflicts: SessionConflict[] = [];

  for (const session of sessions) {
    if (session.id === ignoreSessionId || !activeStatuses.has(session.status)) {
      continue;
    }
    if (session.timetablePeriodId !== candidate.timetablePeriodId) {
      continue;
    }
    if (candidate.assignedTeacherId && session.assignedTeacherId === candidate.assignedTeacherId) {
      conflicts.push({
        code: 'teacher_double_booked',
        message: 'Teacher is already assigned during this timetable period.',
        conflictingSessionId: session.id
      });
    }
    if (candidate.roomId && session.roomId === candidate.roomId) {
      conflicts.push({
        code: 'room_double_booked',
        message: 'Room is already booked during this timetable period.',
        conflictingSessionId: session.id
      });
    }
  }

  return conflicts;
}

export function createSessionService(repository: TimetableRepository) {
  return {
    async create(input: { session: AuthenticatedRosterSession; request: CreateSessionRequest }): Promise<ClassSession> {
      assertAdmin(input.session, input.request.schoolId);
      const timestamp = nowIso();
      const candidate: ClassSession = {
        ...input.request,
        id: input.request.id ?? randomUUID(),
        status: input.request.status ?? 'draft',
        equipmentResourceIds: input.request.equipmentResourceIds ?? [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const periods = await repository.listPeriods(candidate.timetableId);
      const selectedPeriod = periods.find((period) => period.id === candidate.timetablePeriodId);
      if (!selectedPeriod) {
        throw new TimetableValidationError('Timetable period was not found.');
      }
      if (!selectedPeriod.isTeachingPeriod) {
        throw new TimetableValidationError('Class sessions can only be assigned to teaching periods.');
      }
      const conflicts = await detectSessionConflicts({ repository, candidate });
      if (conflicts[0]) {
        throw conflictError(conflicts[0]);
      }
      const created = await repository.createClassSession(candidate);
      await repository.appendAudit({
        id: randomUUID(),
        schoolId: created.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'class_session.create',
        entityType: 'class_session',
        entityId: created.id,
        after: created,
        createdAt: timestamp
      });
      return created;
    },

    async update(input: {
      session: AuthenticatedRosterSession;
      sessionId: string;
      patch: UpdateSessionRequest;
    }): Promise<ClassSession> {
      const existing = await repository.getClassSession(input.sessionId);
      if (!existing) {
        throw new TimetableValidationError('Class session was not found.');
      }
      assertAdmin(input.session, existing.schoolId);
      const timestamp = nowIso();
      const candidate: ClassSession = {
        ...existing,
        ...input.patch,
        equipmentResourceIds: input.patch.equipmentResourceIds ?? existing.equipmentResourceIds,
        updatedAt: timestamp
      };
      if (input.patch.timetablePeriodId) {
        const periods = await repository.listPeriods(candidate.timetableId);
        const selectedPeriod = periods.find((period) => period.id === candidate.timetablePeriodId);
        if (!selectedPeriod) {
          throw new TimetableValidationError('Timetable period was not found.');
        }
        if (!selectedPeriod.isTeachingPeriod) {
          throw new TimetableValidationError('Class sessions can only be assigned to teaching periods.');
        }
      }
      const conflicts = await detectSessionConflicts({ repository, candidate, ignoreSessionId: existing.id });
      if (conflicts[0]) {
        throw conflictError(conflicts[0]);
      }
      const updated = await repository.updateClassSession(candidate);
      await repository.appendAudit({
        id: randomUUID(),
        schoolId: updated.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'class_session.update',
        entityType: 'class_session',
        entityId: updated.id,
        before: existing,
        after: updated,
        createdAt: timestamp
      });
      return updated;
    },

    async get(input: { session: AuthenticatedRosterSession; sessionId: string }): Promise<ClassSession> {
      const existing = await repository.getClassSession(input.sessionId);
      if (!existing) {
        throw new TimetableValidationError('Class session was not found.');
      }
      if (input.session.activeSchoolId !== existing.schoolId) {
        throw new TimetableValidationError('Cross-school session access is not allowed.');
      }
      return existing;
    },

    async delete(input: { session: AuthenticatedRosterSession; sessionId: string }): Promise<void> {
      const existing = await repository.getClassSession(input.sessionId);
      if (!existing) {
        throw new TimetableValidationError('Class session was not found.');
      }
      assertAdmin(input.session, existing.schoolId);
      await repository.deleteClassSession(existing.id);
      const deleted = await repository.getClassSession(existing.id);
      await repository.appendAudit({
        id: randomUUID(),
        schoolId: existing.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'class_session.delete',
        entityType: 'class_session',
        entityId: existing.id,
        before: existing,
        after: deleted ?? { ...existing, status: 'cancelled' },
        createdAt: nowIso()
      });
    },

    async list(input: { session: AuthenticatedRosterSession; schoolId: string; termId: string }): Promise<ClassSession[]> {
      if (input.session.activeSchoolId !== input.schoolId) {
        throw new TimetableValidationError('Cross-school session access is not allowed.');
      }
      return repository.listClassSessions(input.schoolId, input.termId);
    }
  };
}

export type SessionService = ReturnType<typeof createSessionService>;

import { randomUUID } from 'node:crypto';
import type {
  PatchSubstituteAvailabilityRequest,
  SubstituteAvailability,
  SubstituteAvailabilityStatus
} from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';
import { TimetableValidationError, type TimetableRepository } from '../timetable/timetable-service.js';

export type AvailabilityRepository = {
  list(input: {
    schoolId: string;
    teacherId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<SubstituteAvailability[]>;
  upsert(records: SubstituteAvailability[]): Promise<SubstituteAvailability[]>;
};

export class InMemoryAvailabilityRepository implements AvailabilityRepository {
  readonly records = new Map<string, SubstituteAvailability>();

  async list(input: {
    schoolId: string;
    teacherId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<SubstituteAvailability[]> {
    return [...this.records.values()]
      .filter((record) => record.schoolId === input.schoolId)
      .filter((record) => !input.teacherId || record.teacherId === input.teacherId)
      .filter((record) => !input.startDate || record.date >= input.startDate)
      .filter((record) => !input.endDate || record.date <= input.endDate)
      .sort((left, right) => `${left.date}:${left.timetablePeriodId ?? ''}`.localeCompare(`${right.date}:${right.timetablePeriodId ?? ''}`));
  }

  async upsert(records: SubstituteAvailability[]): Promise<SubstituteAvailability[]> {
    for (const record of records) {
      const key = availabilityKey(record);
      const existing = [...this.records.values()].find((item) => availabilityKey(item) === key);
      this.records.set(existing?.id ?? record.id, { ...record, id: existing?.id ?? record.id });
    }
    return records;
  }
}

type AvailabilityRow = {
  id: string;
  school_id: string;
  teacher_id: string;
  date: string | Date;
  timetable_period_id: string | null;
  availability_status: SubstituteAvailabilityStatus;
  reason: string | null;
  updated_by: string;
  updated_at: Date;
};

export class PostgresAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async list(input: {
    schoolId: string;
    teacherId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<SubstituteAvailability[]> {
    const result = await this.database.query<AvailabilityRow>(
      `select id, school_id, teacher_id, date::text, timetable_period_id, availability_status, reason, updated_by, updated_at
       from ${tableRef(this.schema, 'rostering_substitute_availabilities')}
       where school_id = $1
         and ($2::text is null or teacher_id = $2)
         and ($3::date is null or date >= $3::date)
         and ($4::date is null or date <= $4::date)
       order by date, timetable_period_id nulls first, teacher_id`,
      [input.schoolId, input.teacherId ?? null, input.startDate ?? null, input.endDate ?? null]
    );
    return result.rows.map(toAvailability);
  }

  async upsert(records: SubstituteAvailability[]): Promise<SubstituteAvailability[]> {
    const saved: SubstituteAvailability[] = [];
    for (const record of records) {
      const result = await this.database.query<AvailabilityRow>(
        `insert into ${tableRef(this.schema, 'rostering_substitute_availabilities')}
           (id, school_id, teacher_id, date, timetable_period_id, availability_status, reason, updated_by, updated_at)
         values ($1, $2, $3, $4::date, $5, $6, $7, $8, $9::timestamptz)
         on conflict (school_id, teacher_id, date, timetable_period_id) do update set
           availability_status = excluded.availability_status,
           reason = excluded.reason,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at
         returning id, school_id, teacher_id, date::text, timetable_period_id, availability_status, reason, updated_by, updated_at`,
        [
          record.id,
          record.schoolId,
          record.teacherId,
          record.date,
          record.timetablePeriodId ?? null,
          record.availabilityStatus,
          record.reason ?? null,
          record.updatedBy,
          record.updatedAt
        ]
      );
      saved.push(toAvailability(result.rows[0]));
    }
    return saved;
  }
}

export function createAvailabilityService(input: {
  repository: AvailabilityRepository;
  timetableRepository: TimetableRepository;
}) {
  async function list({
    session,
    schoolId,
    teacherId,
    startDate,
    endDate
  }: {
    session: AuthenticatedRosterSession;
    schoolId: string;
    teacherId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    assertCanRead(session, schoolId, teacherId);
    return input.repository.list({
      schoolId,
      teacherId: session.activeRole === 'teacher' ? session.actorByRole.teacher : teacherId,
      startDate,
      endDate
    });
  }

  async function patch({
    session,
    request
  }: {
    session: AuthenticatedRosterSession;
    request: PatchSubstituteAvailabilityRequest;
  }) {
    assertCanWrite(session, request.schoolId, request.teacherId);
    const updatedAt = new Date().toISOString();
    const records = request.records.map((record) => {
      if (!['available', 'unavailable', 'limited'].includes(record.availabilityStatus)) {
        throw new TimetableValidationError('availabilityStatus must be available, unavailable, or limited.');
      }
      return {
        id: randomUUID(),
        schoolId: request.schoolId,
        teacherId: request.teacherId,
        date: record.date,
        timetablePeriodId: record.timetablePeriodId,
        availabilityStatus: record.availabilityStatus,
        reason: record.reason,
        updatedBy: session.user.userId,
        updatedAt
      };
    });
    const saved = await input.repository.upsert(records);
    await input.timetableRepository.appendAudit({
      id: randomUUID(),
      schoolId: request.schoolId,
      actorUserId: session.user.userId,
      actorRole: session.activeRole,
      action: 'substitute_availability.patch',
      entityType: 'substitute_availability',
      entityId: request.teacherId,
      after: saved,
      createdAt: updatedAt
    });
    return saved;
  }

  return { list, patch };
}

function assertCanRead(session: AuthenticatedRosterSession, schoolId: string, teacherId?: string) {
  if (session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Cross-school availability access is not allowed.');
  }
  if (session.activeRole === 'school_admin') return;
  if (session.activeRole === 'teacher' && (!teacherId || teacherId === session.actorByRole.teacher)) return;
  throw new TimetableValidationError('Teachers can only read their own availability.');
}

function assertCanWrite(session: AuthenticatedRosterSession, schoolId: string, teacherId: string) {
  if (session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Cross-school availability access is not allowed.');
  }
  if (session.activeRole === 'school_admin') return;
  if (session.activeRole === 'teacher' && teacherId === session.actorByRole.teacher) return;
  throw new TimetableValidationError('Teachers can only update their own availability.');
}

function availabilityKey(record: Pick<SubstituteAvailability, 'schoolId' | 'teacherId' | 'date' | 'timetablePeriodId'>): string {
  return `${record.schoolId}:${record.teacherId}:${record.date}:${record.timetablePeriodId ?? ''}`;
}

function toAvailability(row: AvailabilityRow): SubstituteAvailability {
  return {
    id: row.id,
    schoolId: row.school_id,
    teacherId: row.teacher_id,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date.slice(0, 10),
    timetablePeriodId: row.timetable_period_id ?? undefined,
    availabilityStatus: row.availability_status,
    reason: row.reason ?? undefined,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString()
  };
}

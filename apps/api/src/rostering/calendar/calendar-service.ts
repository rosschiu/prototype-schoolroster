import { randomUUID } from 'node:crypto';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';

export type SchoolCalendarException = {
  id: string;
  schoolId: string;
  termId?: string;
  exceptionDate: string;
  exceptionType: 'no_school' | 'special_timetable' | 'replacement_day';
  replacementDayIndex?: number;
  notes?: string;
};

export type CalendarRepository = {
  saveException(exception: SchoolCalendarException): Promise<SchoolCalendarException>;
  listExceptions(schoolId: string, termId?: string): Promise<SchoolCalendarException[]>;
};

export class CalendarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarValidationError';
  }
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin' || session.activeSchoolId !== schoolId) {
    throw new CalendarValidationError('Only school admins can manage local calendar exceptions for their own school.');
  }
}

export class InMemoryCalendarRepository implements CalendarRepository {
  readonly exceptions = new Map<string, SchoolCalendarException>();

  async saveException(exception: SchoolCalendarException): Promise<SchoolCalendarException> {
    const duplicate = [...this.exceptions.values()].find(
      (item) => item.schoolId === exception.schoolId && item.exceptionDate === exception.exceptionDate && item.id !== exception.id
    );
    if (duplicate) {
      throw new CalendarValidationError('A calendar exception already exists for this date.');
    }
    this.exceptions.set(exception.id, exception);
    return exception;
  }

  async listExceptions(schoolId: string, termId?: string): Promise<SchoolCalendarException[]> {
    return [...this.exceptions.values()].filter(
      (item) => item.schoolId === schoolId && (!termId || item.termId === termId || !item.termId)
    );
  }
}

type CalendarExceptionRow = {
  id: string;
  school_id: string;
  term_id: string | null;
  exception_date: string | Date;
  exception_type: SchoolCalendarException['exceptionType'];
  replacement_day_index: number | null;
  notes: string | null;
};

function dateText(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function toCalendarException(row: CalendarExceptionRow): SchoolCalendarException {
  return {
    id: row.id,
    schoolId: row.school_id,
    termId: row.term_id ?? undefined,
    exceptionDate: dateText(row.exception_date),
    exceptionType: row.exception_type,
    replacementDayIndex: row.replacement_day_index ?? undefined,
    notes: row.notes ?? undefined
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

export class PostgresCalendarRepository implements CalendarRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async saveException(exception: SchoolCalendarException): Promise<SchoolCalendarException> {
    try {
      await this.database.query(
        `insert into ${tableRef(this.schema, 'rostering_school_calendar_exceptions')} (
          id, school_id, term_id, exception_date, exception_type, replacement_day_index, notes
        )
        values ($1, $2, $3, $4::date, $5, $6, $7)
        on conflict (id) do update set
          term_id = excluded.term_id,
          exception_date = excluded.exception_date,
          exception_type = excluded.exception_type,
          replacement_day_index = excluded.replacement_day_index,
          notes = excluded.notes,
          updated_at = now()`,
        [
          exception.id,
          exception.schoolId,
          exception.termId ?? null,
          exception.exceptionDate,
          exception.exceptionType,
          exception.replacementDayIndex ?? null,
          exception.notes ?? null
        ]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CalendarValidationError('A calendar exception already exists for this date.');
      }
      throw error;
    }
    return exception;
  }

  async listExceptions(schoolId: string, termId?: string): Promise<SchoolCalendarException[]> {
    const result = await this.database.query<CalendarExceptionRow>(
      `select id, school_id, term_id, exception_date::text, exception_type, replacement_day_index, notes
       from ${tableRef(this.schema, 'rostering_school_calendar_exceptions')}
       where school_id = $1 and ($2::text is null or term_id = $2 or term_id is null)
       order by exception_date, id`,
      [schoolId, termId ?? null]
    );
    return result.rows.map(toCalendarException);
  }
}

export function createCalendarService(repository: CalendarRepository) {
  return {
    async createException(input: {
      session: AuthenticatedRosterSession;
      schoolId: string;
      termId?: string;
      exceptionDate: string;
      exceptionType: SchoolCalendarException['exceptionType'];
      replacementDayIndex?: number;
      notes?: string;
    }): Promise<SchoolCalendarException> {
      assertAdmin(input.session, input.schoolId);
      if (input.replacementDayIndex && (input.replacementDayIndex < 1 || input.replacementDayIndex > 7)) {
        throw new CalendarValidationError('Replacement day index must be between 1 and 7.');
      }
      return repository.saveException({
        id: randomUUID(),
        schoolId: input.schoolId,
        termId: input.termId,
        exceptionDate: input.exceptionDate,
        exceptionType: input.exceptionType,
        replacementDayIndex: input.replacementDayIndex,
        notes: input.notes
      });
    },

    async listExceptions(input: { session: AuthenticatedRosterSession; schoolId: string; termId?: string }) {
      if (input.session.activeSchoolId !== input.schoolId) {
        throw new CalendarValidationError('Cross-school calendar access is not allowed.');
      }
      return repository.listExceptions(input.schoolId, input.termId);
    },

    async getExceptionForDate(input: { schoolId: string; termId?: string; date: string }): Promise<SchoolCalendarException | null> {
      const exceptions = await repository.listExceptions(input.schoolId, input.termId);
      return exceptions.find((item) => item.exceptionDate === input.date) ?? null;
    },

    async isNoSchoolDate(input: { schoolId: string; termId?: string; date: string }): Promise<boolean> {
      const exceptions = await repository.listExceptions(input.schoolId, input.termId);
      return exceptions.some((item) => item.exceptionDate === input.date && item.exceptionType === 'no_school');
    }
  };
}

export type CalendarService = ReturnType<typeof createCalendarService>;

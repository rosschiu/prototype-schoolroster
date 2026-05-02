import { randomUUID } from 'node:crypto';
import type {
  CreateTimetableRequest,
  Timetable,
  TimetablePeriod,
  TimetablePeriodHalfDay,
  TimetableStatus,
  UpdateTimetablePeriodInput
} from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';

export type RosterAuditEvent = {
  id: string;
  schoolId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
};

export type TimetableTemplatePeriod = {
  dayIndex: number;
  periodIndex: number;
  label: string;
  startTime: string;
  endTime: string;
  halfDay: TimetablePeriodHalfDay;
  isTeachingPeriod?: boolean;
};

export type TimetableTemplate = {
  key: string;
  name: string;
  timezone: string;
  periods: TimetableTemplatePeriod[];
};

export type ClassSession = {
  id: string;
  schoolId: string;
  termId: string;
  timetableId: string;
  timetablePeriodId: string;
  subjectId: string;
  gradeLevelId: string;
  section: string;
  roomId?: string;
  equipmentResourceIds: string[];
  assignedTeacherId?: string;
  status: 'draft' | 'published' | 'archived' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleProjectionType = 'class' | 'teacher' | 'room' | 'equipment';

export type ScheduleProjection = {
  projectionType: ScheduleProjectionType;
  ownerId: string;
  sessions: Array<ClassSession & { period: TimetablePeriod }>;
};

export type CreateClassSessionInput = Omit<ClassSession, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  id?: string;
  status?: ClassSession['status'];
};

export type TimetableRepository = {
  createTimetable(timetable: Timetable): Promise<Timetable>;
  updateTimetable(timetable: Timetable): Promise<Timetable>;
  getTimetable(id: string): Promise<Timetable | null>;
  findTimetableBySchoolTermName(schoolId: string, termId: string, name: string): Promise<Timetable | null>;
  listTimetables(schoolId: string, termId: string): Promise<Timetable[]>;
  createPeriods(periods: TimetablePeriod[]): Promise<TimetablePeriod[]>;
  replacePeriods(timetableId: string, periods: TimetablePeriod[]): Promise<TimetablePeriod[]>;
  listPeriods(timetableId: string): Promise<TimetablePeriod[]>;
  createClassSession(session: ClassSession): Promise<ClassSession>;
  updateClassSession(session: ClassSession): Promise<ClassSession>;
  getClassSession(id: string): Promise<ClassSession | null>;
  deleteClassSession(id: string): Promise<void>;
  listClassSessions(schoolId: string, termId: string): Promise<ClassSession[]>;
  appendAudit(event: RosterAuditEvent): Promise<void>;
};

export class TimetableValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimetableValidationError';
  }
}

export class TimetableConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimetableConflictError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin') {
    throw new TimetableValidationError('Only school admins can mutate timetables.');
  }
  if (session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Cross-school timetable access is not allowed.');
  }
}

function defaultFiveDayTemplate(): TimetableTemplate {
  const periodSeeds = [
    ['P1', '08:30', '09:10', 'am'],
    ['P2', '09:15', '09:55', 'am'],
    ['P3', '10:15', '10:55', 'am'],
    ['P4', '11:00', '11:40', 'am'],
    ['P5', '13:00', '13:40', 'pm'],
    ['P6', '13:45', '14:25', 'pm'],
    ['P7', '14:40', '15:20', 'pm'],
    ['P8', '15:25', '16:05', 'pm']
  ] as const;

  return {
    key: 'hk-five-day-eight-periods',
    name: 'Five-day, eight-period default',
    timezone: 'Asia/Hong_Kong',
    periods: Array.from({ length: 5 }, (_, dayOffset) =>
      periodSeeds.map(([label, startTime, endTime, halfDay], index) => ({
        dayIndex: dayOffset + 1,
        periodIndex: index + 1,
        label,
        startTime,
        endTime,
        halfDay
      }))
    ).flat()
  };
}

export const timetableTemplates: Record<string, TimetableTemplate> = {
  'hk-five-day-eight-periods': defaultFiveDayTemplate()
};

export function buildDefaultPeriods({
  timetable,
  template = timetableTemplates['hk-five-day-eight-periods']
}: {
  timetable: Timetable;
  template?: TimetableTemplate;
}): TimetablePeriod[] {
  if (!template) {
    throw new TimetableValidationError('Timetable template is not available.');
  }

  return template.periods.map((period, index) => ({
    id: randomUUID(),
    timetableId: timetable.id,
    schoolId: timetable.schoolId,
    dayIndex: period.dayIndex,
    periodIndex: period.periodIndex,
    label: period.label,
    startTime: period.startTime,
    endTime: period.endTime,
    halfDay: period.halfDay,
    sortOrder: index + 1,
    isTeachingPeriod: period.isTeachingPeriod ?? true
  }));
}

function timeToMinutes(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    throw new TimetableValidationError('Period times must use HH:MM 24-hour format.');
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizePeriodInput({
  timetable,
  input,
  index
}: {
  timetable: Timetable;
  input: UpdateTimetablePeriodInput;
  index: number;
}): TimetablePeriod {
  const label = input.label.trim();
  if (!label) {
    throw new TimetableValidationError('Period label is required.');
  }
  if (input.dayIndex < 1 || input.dayIndex > 7 || !Number.isInteger(input.dayIndex)) {
    throw new TimetableValidationError('dayIndex must be an integer between 1 and 7.');
  }
  if (input.periodIndex < 1 || !Number.isInteger(input.periodIndex)) {
    throw new TimetableValidationError('periodIndex must be a positive integer.');
  }
  if (input.halfDay !== 'am' && input.halfDay !== 'pm') {
    throw new TimetableValidationError('halfDay must be am or pm.');
  }
  if (timeToMinutes(input.startTime) >= timeToMinutes(input.endTime)) {
    throw new TimetableValidationError('Period start time must be before end time.');
  }

  return {
    id: input.id?.trim() || randomUUID(),
    timetableId: timetable.id,
    schoolId: timetable.schoolId,
    dayIndex: input.dayIndex,
    periodIndex: input.periodIndex,
    label,
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    halfDay: input.halfDay,
    sortOrder: input.sortOrder ?? index + 1,
    isTeachingPeriod: input.isTeachingPeriod ?? true
  };
}

function validatePeriodSet(periods: TimetablePeriod[]): void {
  if (periods.length === 0) {
    throw new TimetableValidationError('At least one timetable period is required.');
  }
  const teachingPeriods = periods.filter((period) => period.isTeachingPeriod);
  if (teachingPeriods.length === 0) {
    throw new TimetableValidationError('At least one teaching period is required.');
  }
  if (!teachingPeriods.some((period) => period.halfDay === 'am') || !teachingPeriods.some((period) => period.halfDay === 'pm')) {
    throw new TimetableValidationError('Teaching periods must include at least one AM and one PM period.');
  }

  const byDayAndIndex = new Set<string>();
  const bySortOrder = new Set<number>();
  for (const period of periods) {
    const periodKey = `${period.dayIndex}:${period.periodIndex}`;
    if (byDayAndIndex.has(periodKey)) {
      throw new TimetableValidationError('Each day/period combination must be unique.');
    }
    byDayAndIndex.add(periodKey);
    if (bySortOrder.has(period.sortOrder)) {
      throw new TimetableValidationError('Each period sortOrder must be unique.');
    }
    bySortOrder.add(period.sortOrder);
  }

  const periodsByDay = new Map<number, TimetablePeriod[]>();
  for (const period of periods) {
    periodsByDay.set(period.dayIndex, [...(periodsByDay.get(period.dayIndex) ?? []), period]);
  }
  for (const dayPeriods of periodsByDay.values()) {
    const sorted = [...dayPeriods].sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
    for (let index = 1; index < sorted.length; index += 1) {
      if (timeToMinutes(sorted[index - 1].endTime) > timeToMinutes(sorted[index].startTime)) {
        throw new TimetableValidationError('Periods cannot overlap within the same day.');
      }
    }
  }
}

export class InMemoryTimetableRepository implements TimetableRepository {
  readonly timetables = new Map<string, Timetable>();
  readonly periods = new Map<string, TimetablePeriod>();
  readonly sessions = new Map<string, ClassSession>();
  readonly auditEvents: RosterAuditEvent[] = [];

  async createTimetable(timetable: Timetable): Promise<Timetable> {
    this.timetables.set(timetable.id, timetable);
    return timetable;
  }

  async updateTimetable(timetable: Timetable): Promise<Timetable> {
    this.timetables.set(timetable.id, timetable);
    return timetable;
  }

  async getTimetable(id: string): Promise<Timetable | null> {
    return this.timetables.get(id) ?? null;
  }

  async findTimetableBySchoolTermName(schoolId: string, termId: string, name: string): Promise<Timetable | null> {
    return [...this.timetables.values()].find((item) => item.schoolId === schoolId && item.termId === termId && item.name === name) ?? null;
  }

  async listTimetables(schoolId: string, termId: string): Promise<Timetable[]> {
    return [...this.timetables.values()].filter((item) => item.schoolId === schoolId && item.termId === termId);
  }

  async createPeriods(periods: TimetablePeriod[]): Promise<TimetablePeriod[]> {
    for (const period of periods) {
      this.periods.set(period.id, period);
    }
    return periods;
  }

  async replacePeriods(timetableId: string, periods: TimetablePeriod[]): Promise<TimetablePeriod[]> {
    for (const period of [...this.periods.values()].filter((item) => item.timetableId === timetableId)) {
      this.periods.delete(period.id);
    }
    return this.createPeriods(periods);
  }

  async listPeriods(timetableId: string): Promise<TimetablePeriod[]> {
    return [...this.periods.values()]
      .filter((item) => item.timetableId === timetableId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async createClassSession(session: ClassSession): Promise<ClassSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async updateClassSession(session: ClassSession): Promise<ClassSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async getClassSession(id: string): Promise<ClassSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async deleteClassSession(id: string): Promise<void> {
    const existing = this.sessions.get(id);
    if (existing) {
      this.sessions.set(id, {
        ...existing,
        status: 'cancelled',
        updatedAt: nowIso()
      });
    }
  }

  async listClassSessions(schoolId: string, termId: string): Promise<ClassSession[]> {
    return [...this.sessions.values()].filter((item) => item.schoolId === schoolId && item.termId === termId);
  }

  async appendAudit(event: RosterAuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }
}

type TimetableRow = {
  id: string;
  school_id: string;
  term_id: string;
  name: string;
  status: TimetableStatus;
  template_key: string | null;
  timezone: string;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  structure_confirmed_at: Date | null;
};

type TimetablePeriodRow = {
  id: string;
  timetable_id: string;
  school_id: string;
  day_index: number;
  period_index: number;
  label: string;
  start_time: string;
  end_time: string;
  half_day: TimetablePeriodHalfDay;
  sort_order: number;
  is_teaching_period: boolean;
};

type ClassSessionRow = {
  id: string;
  school_id: string;
  term_id: string;
  timetable_id: string;
  timetable_period_id: string;
  subject_id: string;
  grade_level_id: string;
  section: string;
  room_id: string | null;
  assigned_teacher_id: string | null;
  status: ClassSession['status'];
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

type EquipmentRow = {
  schedule_session_id: string;
  equipment_resource_id: string;
};

function dateIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function timeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.length >= 5 ? value.slice(0, 5) : value;
  }
  return String(value);
}

function toTimetable(row: TimetableRow): Timetable {
  return {
    id: row.id,
    schoolId: row.school_id,
    termId: row.term_id,
    name: row.name,
    status: row.status,
    templateKey: row.template_key ?? undefined,
    timezone: row.timezone,
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at),
    publishedAt: row.published_at ? dateIso(row.published_at) : undefined,
    structureConfirmedAt: row.structure_confirmed_at ? dateIso(row.structure_confirmed_at) : undefined
  };
}

function toPeriod(row: TimetablePeriodRow): TimetablePeriod {
  return {
    id: row.id,
    timetableId: row.timetable_id,
    schoolId: row.school_id,
    dayIndex: row.day_index,
    periodIndex: row.period_index,
    label: row.label,
    startTime: timeText(row.start_time),
    endTime: timeText(row.end_time),
    halfDay: row.half_day,
    sortOrder: row.sort_order,
    isTeachingPeriod: row.is_teaching_period
  };
}

function toClassSession(row: ClassSessionRow, equipmentResourceIds: string[]): ClassSession {
  return {
    id: row.id,
    schoolId: row.school_id,
    termId: row.term_id,
    timetableId: row.timetable_id,
    timetablePeriodId: row.timetable_period_id,
    subjectId: row.subject_id,
    gradeLevelId: row.grade_level_id,
    section: row.section,
    roomId: row.room_id ?? undefined,
    equipmentResourceIds,
    assignedTeacherId: row.assigned_teacher_id ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  };
}

export class PostgresTimetableRepository implements TimetableRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async createTimetable(timetable: Timetable): Promise<Timetable> {
    await this.database.query(
      `insert into ${tableRef(this.schema, 'rostering_timetables')} (
          id, school_id, term_id, name, status, template_key, timezone, created_at, updated_at, published_at, structure_confirmed_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        timetable.id,
        timetable.schoolId,
        timetable.termId,
        timetable.name,
        timetable.status,
        timetable.templateKey ?? null,
        timetable.timezone,
        timetable.createdAt,
        timetable.updatedAt,
        timetable.publishedAt ?? null,
        timetable.structureConfirmedAt ?? null
      ]
    );
    return timetable;
  }

  async updateTimetable(timetable: Timetable): Promise<Timetable> {
    await this.database.query(
      `update ${tableRef(this.schema, 'rostering_timetables')}
       set name = $2,
           status = $3,
           template_key = $4,
           timezone = $5,
           updated_at = $6,
           published_at = $7,
           structure_confirmed_at = $8
       where id = $1`,
      [
        timetable.id,
        timetable.name,
        timetable.status,
        timetable.templateKey ?? null,
        timetable.timezone,
        timetable.updatedAt,
        timetable.publishedAt ?? null,
        timetable.structureConfirmedAt ?? null
      ]
    );
    return timetable;
  }

  async getTimetable(id: string): Promise<Timetable | null> {
    const result = await this.database.query<TimetableRow>(
      `select id, school_id, term_id, name, status, template_key, timezone, created_at, updated_at, published_at, structure_confirmed_at
       from ${tableRef(this.schema, 'rostering_timetables')}
       where id = $1`,
      [id]
    );
    return result.rows[0] ? toTimetable(result.rows[0]) : null;
  }

  async findTimetableBySchoolTermName(schoolId: string, termId: string, name: string): Promise<Timetable | null> {
    const result = await this.database.query<TimetableRow>(
      `select id, school_id, term_id, name, status, template_key, timezone, created_at, updated_at, published_at, structure_confirmed_at
       from ${tableRef(this.schema, 'rostering_timetables')}
       where school_id = $1 and term_id = $2 and name = $3`,
      [schoolId, termId, name]
    );
    return result.rows[0] ? toTimetable(result.rows[0]) : null;
  }

  async listTimetables(schoolId: string, termId: string): Promise<Timetable[]> {
    const result = await this.database.query<TimetableRow>(
      `select id, school_id, term_id, name, status, template_key, timezone, created_at, updated_at, published_at, structure_confirmed_at
       from ${tableRef(this.schema, 'rostering_timetables')}
       where school_id = $1 and term_id = $2
       order by created_at, name`,
      [schoolId, termId]
    );
    return result.rows.map(toTimetable);
  }

  async createPeriods(periods: TimetablePeriod[]): Promise<TimetablePeriod[]> {
    for (const period of periods) {
      await this.database.query(
        `insert into ${tableRef(this.schema, 'rostering_timetable_periods')} (
          id, timetable_id, school_id, day_index, period_index, label, start_time, end_time, half_day, sort_order, is_teaching_period
        )
        values ($1, $2, $3, $4, $5, $6, $7::time, $8::time, $9, $10, $11)`,
        [
          period.id,
          period.timetableId,
          period.schoolId,
          period.dayIndex,
          period.periodIndex,
          period.label,
          period.startTime,
          period.endTime,
          period.halfDay,
          period.sortOrder,
          period.isTeachingPeriod
        ]
      );
    }
    return periods;
  }

  async replacePeriods(timetableId: string, periods: TimetablePeriod[]): Promise<TimetablePeriod[]> {
    await this.database.query(
      `delete from ${tableRef(this.schema, 'rostering_timetable_periods')}
       where timetable_id = $1`,
      [timetableId]
    );
    return this.createPeriods(periods);
  }

  async listPeriods(timetableId: string): Promise<TimetablePeriod[]> {
    const result = await this.database.query<TimetablePeriodRow>(
      `select id, timetable_id, school_id, day_index, period_index, label, start_time::text, end_time::text, half_day, sort_order, is_teaching_period
       from ${tableRef(this.schema, 'rostering_timetable_periods')}
       where timetable_id = $1
       order by sort_order`,
      [timetableId]
    );
    return result.rows.map(toPeriod);
  }

  async createClassSession(session: ClassSession): Promise<ClassSession> {
    await this.database.query(
      `insert into ${tableRef(this.schema, 'rostering_schedule_sessions')} (
        id, school_id, term_id, timetable_id, timetable_period_id, subject_id, grade_level_id,
        section, room_id, assigned_teacher_id, status, notes, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        session.id,
        session.schoolId,
        session.termId,
        session.timetableId,
        session.timetablePeriodId,
        session.subjectId,
        session.gradeLevelId,
        session.section,
        session.roomId ?? null,
        session.assignedTeacherId ?? null,
        session.status,
        session.notes ?? null,
        session.createdAt,
        session.updatedAt
      ]
    );
    await this.replaceEquipment(session.id, session.equipmentResourceIds);
    return session;
  }

  async updateClassSession(session: ClassSession): Promise<ClassSession> {
    await this.database.query(
      `update ${tableRef(this.schema, 'rostering_schedule_sessions')}
       set timetable_period_id = $2,
           subject_id = $3,
           grade_level_id = $4,
           section = $5,
           room_id = $6,
           assigned_teacher_id = $7,
           status = $8,
           notes = $9,
           updated_at = $10
       where id = $1`,
      [
        session.id,
        session.timetablePeriodId,
        session.subjectId,
        session.gradeLevelId,
        session.section,
        session.roomId ?? null,
        session.assignedTeacherId ?? null,
        session.status,
        session.notes ?? null,
        session.updatedAt
      ]
    );
    await this.replaceEquipment(session.id, session.equipmentResourceIds);
    return session;
  }

  async getClassSession(id: string): Promise<ClassSession | null> {
    const sessions = await this.loadSessions('where s.id = $1', [id]);
    return sessions[0] ?? null;
  }

  async deleteClassSession(id: string): Promise<void> {
    await this.database.query(
      `update ${tableRef(this.schema, 'rostering_schedule_sessions')}
       set status = 'cancelled', updated_at = now()
       where id = $1`,
      [id]
    );
  }

  async listClassSessions(schoolId: string, termId: string): Promise<ClassSession[]> {
    return this.loadSessions('where s.school_id = $1 and s.term_id = $2', [schoolId, termId]);
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

  private async replaceEquipment(sessionId: string, equipmentResourceIds: string[]): Promise<void> {
    await this.database.query(
      `delete from ${tableRef(this.schema, 'rostering_schedule_session_equipment_resources')}
       where schedule_session_id = $1`,
      [sessionId]
    );
    for (const equipmentResourceId of equipmentResourceIds) {
      await this.database.query(
        `insert into ${tableRef(this.schema, 'rostering_schedule_session_equipment_resources')} (
          schedule_session_id, equipment_resource_id
        )
        values ($1, $2)
        on conflict (schedule_session_id, equipment_resource_id) do nothing`,
        [sessionId, equipmentResourceId]
      );
    }
  }

  private async loadSessions(whereSql: string, values: unknown[]): Promise<ClassSession[]> {
    const sessionResult = await this.database.query<ClassSessionRow>(
      `select s.id, s.school_id, s.term_id, s.timetable_id, s.timetable_period_id, s.subject_id,
              s.grade_level_id, s.section, s.room_id, s.assigned_teacher_id, s.status, s.notes,
              s.created_at, s.updated_at
       from ${tableRef(this.schema, 'rostering_schedule_sessions')} s
       ${whereSql}
       order by s.created_at, s.id`,
      values
    );
    const sessionIds = sessionResult.rows.map((row) => row.id);
    const equipmentBySession = new Map<string, string[]>();
    if (sessionIds.length > 0) {
      const equipmentResult = await this.database.query<EquipmentRow>(
        `select schedule_session_id, equipment_resource_id
         from ${tableRef(this.schema, 'rostering_schedule_session_equipment_resources')}
         where schedule_session_id = any($1::text[])
         order by equipment_resource_id`,
        [sessionIds]
      );
      for (const row of equipmentResult.rows) {
        equipmentBySession.set(row.schedule_session_id, [
          ...(equipmentBySession.get(row.schedule_session_id) ?? []),
          row.equipment_resource_id
        ]);
      }
    }
    return sessionResult.rows.map((row) => toClassSession(row, equipmentBySession.get(row.id) ?? []));
  }
}

export function createTimetableService(repository: TimetableRepository) {
  return {
    async createFromDefault(input: {
      session: AuthenticatedRosterSession;
      request: CreateTimetableRequest;
    }): Promise<{ timetable: Timetable; periods: TimetablePeriod[] }> {
      assertAdmin(input.session, input.request.schoolId);
      const existing = await repository.findTimetableBySchoolTermName(
        input.request.schoolId,
        input.request.termId,
        input.request.name
      );
      if (existing) {
        throw new TimetableConflictError('A timetable with this school, term, and name already exists.');
      }

      const templateKey = input.request.templateKey ?? 'hk-five-day-eight-periods';
      const template = timetableTemplates[templateKey];
      if (!template) {
        throw new TimetableValidationError(`Unknown timetable template: ${templateKey}`);
      }

      const timestamp = nowIso();
      const timetable: Timetable = {
        id: randomUUID(),
        schoolId: input.request.schoolId,
        termId: input.request.termId,
        name: input.request.name,
        status: 'draft',
        templateKey,
        timezone: input.request.timezone ?? template.timezone,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await repository.createTimetable(timetable);
      const periods = await repository.createPeriods(buildDefaultPeriods({ timetable, template }));
      return { timetable, periods };
    },

    async list(input: { session: AuthenticatedRosterSession; schoolId: string; termId: string }): Promise<Timetable[]> {
      if (input.session.activeSchoolId !== input.schoolId) {
        throw new TimetableValidationError('Cross-school timetable access is not allowed.');
      }
      return repository.listTimetables(input.schoolId, input.termId);
    },

    async publish(input: { session: AuthenticatedRosterSession; timetableId: string }): Promise<Timetable> {
      const timetable = await repository.getTimetable(input.timetableId);
      if (!timetable) {
        throw new TimetableValidationError('Timetable was not found.');
      }
      assertAdmin(input.session, timetable.schoolId);
      if (timetable.status === 'archived') {
        throw new TimetableValidationError('Archived timetables cannot be published.');
      }
      if (!timetable.structureConfirmedAt) {
        throw new TimetableValidationError('Confirm timetable structure before publishing.');
      }
      const before = { ...timetable };
      const timestamp = nowIso();
      const updated: Timetable = {
        ...timetable,
        status: 'published' as TimetableStatus,
        updatedAt: timestamp,
        publishedAt: timestamp
      };
      await repository.updateTimetable(updated);
      const sessions = await repository.listClassSessions(updated.schoolId, updated.termId);
      for (const classSession of sessions.filter((item) => item.timetableId === updated.id && item.status === 'draft')) {
        await repository.updateClassSession({ ...classSession, status: 'published', updatedAt: timestamp });
      }
      await repository.appendAudit({
        id: randomUUID(),
        schoolId: updated.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'timetable.publish',
        entityType: 'timetable',
        entityId: updated.id,
        before,
        after: updated,
        createdAt: timestamp
      });
      return updated;
    },

    async updatePeriods(input: {
      session: AuthenticatedRosterSession;
      timetableId: string;
      periods: UpdateTimetablePeriodInput[];
    }): Promise<{ timetable: Timetable; periods: TimetablePeriod[] }> {
      const timetable = await repository.getTimetable(input.timetableId);
      if (!timetable) {
        throw new TimetableValidationError('Timetable was not found.');
      }
      assertAdmin(input.session, timetable.schoolId);
      if (timetable.status !== 'draft') {
        throw new TimetableValidationError('Only draft timetable structures can be amended.');
      }
      const sessions = await repository.listClassSessions(timetable.schoolId, timetable.termId);
      if (sessions.some((session) => session.timetableId === timetable.id && session.status !== 'cancelled')) {
        throw new TimetableValidationError('Timetable structure cannot be amended after class sessions exist.');
      }

      const normalizedPeriods = input.periods.map((period, index) => normalizePeriodInput({ timetable, input: period, index }));
      validatePeriodSet(normalizedPeriods);
      const beforePeriods = await repository.listPeriods(timetable.id);
      const timestamp = nowIso();
      const updatedTimetable: Timetable = {
        ...timetable,
        structureConfirmedAt: undefined,
        updatedAt: timestamp
      };
      await repository.updateTimetable(updatedTimetable);
      const updatedPeriods = await repository.replacePeriods(timetable.id, normalizedPeriods);
      await repository.appendAudit({
        id: randomUUID(),
        schoolId: timetable.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'timetable.periods.updated',
        entityType: 'timetable',
        entityId: timetable.id,
        before: { timetable, periods: beforePeriods },
        after: { timetable: updatedTimetable, periods: updatedPeriods },
        createdAt: timestamp
      });
      return { timetable: updatedTimetable, periods: updatedPeriods };
    },

    async confirmStructure(input: {
      session: AuthenticatedRosterSession;
      timetableId: string;
    }): Promise<{ timetable: Timetable; periods: TimetablePeriod[] }> {
      const timetable = await repository.getTimetable(input.timetableId);
      if (!timetable) {
        throw new TimetableValidationError('Timetable was not found.');
      }
      assertAdmin(input.session, timetable.schoolId);
      if (timetable.status !== 'draft') {
        throw new TimetableValidationError('Only draft timetable structures can be confirmed.');
      }
      const periods = await repository.listPeriods(timetable.id);
      validatePeriodSet(periods);
      const timestamp = nowIso();
      const updated: Timetable = {
        ...timetable,
        structureConfirmedAt: timestamp,
        updatedAt: timestamp
      };
      await repository.updateTimetable(updated);
      await repository.appendAudit({
        id: randomUUID(),
        schoolId: updated.schoolId,
        actorUserId: input.session.user.userId,
        actorRole: input.session.activeRole,
        action: 'timetable.structure.confirmed',
        entityType: 'timetable',
        entityId: updated.id,
        before: timetable,
        after: updated,
        createdAt: timestamp
      });
      return { timetable: updated, periods };
    },

    async createClassSession(input: {
      session: AuthenticatedRosterSession;
      request: CreateClassSessionInput;
    }): Promise<ClassSession> {
      assertAdmin(input.session, input.request.schoolId);
      const { createSessionService } = await import('./session-service.js');
      return createSessionService(repository).create(input);
    },

    async getProjection(input: {
      session: AuthenticatedRosterSession;
      schoolId: string;
      termId: string;
      projectionType: ScheduleProjectionType;
      ownerId: string;
    }): Promise<ScheduleProjection> {
      if (input.session.activeSchoolId !== input.schoolId) {
        throw new TimetableValidationError('Cross-school projection access is not allowed.');
      }
      if (input.session.activeRole === 'teacher' && input.projectionType === 'teacher') {
        const teacherActor = input.session.actorByRole.teacher;
        if (teacherActor && teacherActor !== input.ownerId) {
          throw new TimetableValidationError('Teachers can only view their own roster projection.');
        }
      } else if (input.session.activeRole !== 'school_admin') {
        throw new TimetableValidationError('This projection requires a school admin session.');
      }

      const sessions = await repository.listClassSessions(input.schoolId, input.termId);
      const filtered = sessions.filter((session) => {
        if (input.projectionType === 'teacher') return session.assignedTeacherId === input.ownerId;
        if (input.projectionType === 'room') return session.roomId === input.ownerId;
        if (input.projectionType === 'equipment') return session.equipmentResourceIds.includes(input.ownerId);
        return `${session.gradeLevelId}:${session.section}` === input.ownerId;
      });
      const periodsById = new Map<string, TimetablePeriod>();
      for (const timetable of await repository.listTimetables(input.schoolId, input.termId)) {
        for (const period of await repository.listPeriods(timetable.id)) {
          periodsById.set(period.id, period);
        }
      }
      return {
        projectionType: input.projectionType,
        ownerId: input.ownerId,
        sessions: filtered
          .map((session) => {
            const period = periodsById.get(session.timetablePeriodId);
            return period ? { ...session, period } : null;
          })
          .filter((item): item is ClassSession & { period: TimetablePeriod } => item !== null)
      };
    }
  };
}

export type TimetableService = ReturnType<typeof createTimetableService>;

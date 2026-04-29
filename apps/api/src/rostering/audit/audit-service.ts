import type { RosterAuditLogEntry } from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';
import type { RosterAuditEvent } from '../timetable/timetable-service.js';
import { TimetableValidationError } from '../timetable/timetable-service.js';

export type RosterAuditQuery = {
  schoolId: string;
  actorUserId?: string;
  eventType?: string;
  objectType?: string;
  objectId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type RosterAuditRepository = {
  list(query: RosterAuditQuery): Promise<RosterAuditLogEntry[]>;
};

export type AuditEventSource = {
  auditEvents?: RosterAuditEvent[];
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toLogEntry(event: RosterAuditEvent): RosterAuditLogEntry {
  const metadata: Record<string, unknown> = {};
  if (event.before !== undefined) metadata.before = event.before;
  if (event.after !== undefined) metadata.after = event.after;
  return {
    id: event.id,
    schoolId: event.schoolId,
    actorUserId: event.actorUserId,
    actorRole: event.actorRole,
    eventType: event.action,
    objectType: event.entityType,
    objectId: event.entityId,
    message: event.action,
    reason: null,
    metadata,
    createdAt: event.createdAt
  };
}

function matches(entry: RosterAuditLogEntry, query: RosterAuditQuery): boolean {
  if (entry.schoolId !== query.schoolId) return false;
  if (query.actorUserId && entry.actorUserId !== query.actorUserId) return false;
  if (query.eventType && entry.eventType !== query.eventType) return false;
  if (query.objectType && entry.objectType !== query.objectType) return false;
  if (query.objectId && entry.objectId !== query.objectId) return false;
  if (query.startDate && entry.createdAt < query.startDate) return false;
  if (query.endDate && entry.createdAt > query.endDate) return false;
  return true;
}

export class InMemoryAuditRepository implements RosterAuditRepository {
  constructor(private readonly sources: AuditEventSource[]) {}

  async list(query: RosterAuditQuery): Promise<RosterAuditLogEntry[]> {
    return this.sources
      .flatMap((source) => source.auditEvents ?? [])
      .map(toLogEntry)
      .filter((entry) => matches(entry, query))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, query.limit ?? 100);
  }
}

type AuditRow = {
  id: string;
  school_id: string;
  actor_user_id: string | null;
  actor_role: string;
  event_type: string;
  object_type: string;
  object_id: string;
  message: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
};

export class PostgresAuditRepository implements RosterAuditRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async list(query: RosterAuditQuery): Promise<RosterAuditLogEntry[]> {
    const clauses = ['school_id = $1'];
    const values: unknown[] = [query.schoolId];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replace('?', `$${values.length}`));
    };
    if (query.actorUserId) add('actor_user_id = ?', query.actorUserId);
    if (query.eventType) add('event_type = ?', query.eventType);
    if (query.objectType) add('object_type = ?', query.objectType);
    if (query.objectId) add('object_id = ?', query.objectId);
    if (query.startDate) add('created_at >= ?::timestamptz', query.startDate);
    if (query.endDate) add('created_at <= ?::timestamptz', query.endDate);
    values.push(query.limit ?? 100);
    const result = await this.database.query<AuditRow>(
      `select id, school_id, actor_user_id, actor_role, event_type, object_type, object_id,
        message, reason, metadata, created_at
       from ${tableRef(this.schema, 'audit_events')}
       where ${clauses.join(' and ')}
       order by created_at desc
       limit $${values.length}`,
      values
    );
    return result.rows.map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      actorUserId: row.actor_user_id ?? '',
      actorRole: row.actor_role,
      eventType: row.event_type,
      objectType: row.object_type,
      objectId: row.object_id,
      message: row.message,
      reason: row.reason,
      metadata: row.metadata ?? {},
      createdAt: toIso(row.created_at)
    }));
  }
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin') {
    throw new TimetableValidationError('Only school admins can view roster audit events.');
  }
  if (session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Cross-school audit access is not allowed.');
  }
}

export function createRosterAuditService(repository: RosterAuditRepository) {
  return {
    async list({ session, query }: { session: AuthenticatedRosterSession; query: RosterAuditQuery }): Promise<{ auditEvents: RosterAuditLogEntry[] }> {
      assertAdmin(session, query.schoolId);
      const limit = Math.max(1, Math.min(200, query.limit ?? 100));
      return { auditEvents: await repository.list({ ...query, limit }) };
    }
  };
}

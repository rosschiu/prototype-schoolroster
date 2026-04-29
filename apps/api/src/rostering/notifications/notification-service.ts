import { randomUUID } from 'node:crypto';
import type { PostgresDatabase } from '../../db/postgres.js';
import { tableRef } from '../db/schema.js';

export type RosterNotificationEventType =
  | 'leave.applied'
  | 'leave.approved'
  | 'leave.rejected'
  | 'leave.cancelled'
  | 'substitute.offered'
  | 'substitute.accepted'
  | 'substitute.declined'
  | 'substitute.canceled'
  | 'substitute.completed';

export type RosterNotification = {
  id: string;
  schoolId: string;
  recipientRole?: 'school_admin' | 'teacher';
  recipientActorId?: string;
  eventType: RosterNotificationEventType;
  title: string;
  body: string;
  deepLink: string;
  entityType: 'leave_request' | 'substitute_assignment';
  entityId: string;
  createdAt: string;
  readAt?: string;
};

export type MockEmailRecord = {
  id: string;
  schoolId: string;
  toRole?: 'school_admin' | 'teacher';
  toActorId?: string;
  subject: string;
  body: string;
  deepLink: string;
  createdAt: string;
};

export type NotificationRepository = {
  saveNotification(notification: RosterNotification): Promise<RosterNotification>;
  saveMockEmail(email: MockEmailRecord): Promise<MockEmailRecord>;
  listNotifications(schoolId: string): Promise<RosterNotification[]>;
  listMockEmails(schoolId: string): Promise<MockEmailRecord[]>;
};

export class InMemoryNotificationRepository implements NotificationRepository {
  readonly notifications = new Map<string, RosterNotification>();
  readonly mockEmails = new Map<string, MockEmailRecord>();

  async saveNotification(notification: RosterNotification): Promise<RosterNotification> {
    this.notifications.set(notification.id, notification);
    return notification;
  }

  async saveMockEmail(email: MockEmailRecord): Promise<MockEmailRecord> {
    this.mockEmails.set(email.id, email);
    return email;
  }

  async listNotifications(schoolId: string): Promise<RosterNotification[]> {
    return [...this.notifications.values()].filter((item) => item.schoolId === schoolId);
  }

  async listMockEmails(schoolId: string): Promise<MockEmailRecord[]> {
    return [...this.mockEmails.values()].filter((item) => item.schoolId === schoolId);
  }
}

type NotificationRow = {
  id: string;
  event_type: RosterNotificationEventType;
  category: string;
  title: string;
  message: string;
  href: string;
  object_id: string | null;
  recipient_role: 'school_admin' | 'teacher';
  recipient_user_id: string;
  read_at: Date | null;
  created_at: Date;
};

function dateTimeIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function categoryFor(kind: 'notification' | 'email', schoolId: string): string {
  return `rostering:${kind}:${schoolId}`;
}

function schoolIdFromCategory(category: string): string {
  return category.split(':').slice(2).join(':');
}

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async saveNotification(notification: RosterNotification): Promise<RosterNotification> {
    await this.database.query(
      `insert into ${tableRef(this.schema, 'notification_events')} (
        id, event_type, category, title, message, href, actor_name, assignment_id, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `event-${notification.id}`,
        notification.eventType,
        categoryFor('notification', notification.schoolId),
        notification.title,
        notification.body,
        notification.deepLink,
        notification.recipientActorId ?? null,
        notification.entityId,
        notification.createdAt
      ]
    );
    await this.database.query(
      `insert into ${tableRef(this.schema, 'notifications')} (
        id, event_id, recipient_role, recipient_user_id, read_at, created_at
      )
      values ($1, $2, $3, $4, $5, $6)`,
      [
        notification.id,
        `event-${notification.id}`,
        notification.recipientRole ?? 'school_admin',
        notification.recipientActorId ?? `role:${notification.recipientRole ?? 'school_admin'}`,
        notification.readAt ?? null,
        notification.createdAt
      ]
    );
    return notification;
  }

  async saveMockEmail(email: MockEmailRecord): Promise<MockEmailRecord> {
    const eventId = `event-${email.id}`;
    await this.database.query(
      `insert into ${tableRef(this.schema, 'notification_events')} (
        id, event_type, category, title, message, href, actor_name, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        eventId,
        'mock.email',
        categoryFor('email', email.schoolId),
        email.subject,
        email.body,
        email.deepLink,
        email.toActorId ?? null,
        email.createdAt
      ]
    );
    await this.database.query(
      `insert into ${tableRef(this.schema, 'notifications')} (
        id, event_id, recipient_role, recipient_user_id, created_at
      )
      values ($1, $2, $3, $4, $5)`,
      [email.id, eventId, email.toRole ?? 'school_admin', email.toActorId ?? `role:${email.toRole ?? 'school_admin'}`, email.createdAt]
    );
    await this.database.query(
      `insert into ${tableRef(this.schema, 'email_deliveries')} (
        id, notification_id, recipient_user_id, template_key, status, queued_at
      )
      values ($1, $2, $3, $4, 'queued', $5)`,
      [email.id, email.id, email.toActorId ?? `role:${email.toRole ?? 'school_admin'}`, 'rostering.mock_email', email.createdAt]
    );
    return email;
  }

  async listNotifications(schoolId: string): Promise<RosterNotification[]> {
    const result = await this.database.query<NotificationRow>(
      `select n.id, ne.event_type, ne.category, ne.title, ne.message, ne.href,
              ne.assignment_id as object_id, n.recipient_role, n.recipient_user_id,
              n.read_at, n.created_at
       from ${tableRef(this.schema, 'notifications')} n
       inner join ${tableRef(this.schema, 'notification_events')} ne on ne.id = n.event_id
       where ne.category = $1
       order by n.created_at, n.id`,
      [categoryFor('notification', schoolId)]
    );
    return result.rows.map((row) => ({
      id: row.id,
      schoolId: schoolIdFromCategory(row.category),
      recipientRole: row.recipient_role,
      recipientActorId: row.recipient_user_id.startsWith('role:') ? undefined : row.recipient_user_id,
      eventType: row.event_type,
      title: row.title,
      body: row.message,
      deepLink: row.href,
      entityType: row.event_type.startsWith('substitute.') ? 'substitute_assignment' : 'leave_request',
      entityId: row.object_id ?? '',
      createdAt: dateTimeIso(row.created_at),
      readAt: row.read_at ? dateTimeIso(row.read_at) : undefined
    }));
  }

  async listMockEmails(schoolId: string): Promise<MockEmailRecord[]> {
    const result = await this.database.query<NotificationRow>(
      `select n.id, ne.event_type, ne.category, ne.title, ne.message, ne.href,
              ne.assignment_id as object_id, n.recipient_role, n.recipient_user_id,
              n.read_at, n.created_at
       from ${tableRef(this.schema, 'notifications')} n
       inner join ${tableRef(this.schema, 'notification_events')} ne on ne.id = n.event_id
       where ne.category = $1
       order by n.created_at, n.id`,
      [categoryFor('email', schoolId)]
    );
    return result.rows.map((row) => ({
      id: row.id,
      schoolId: schoolIdFromCategory(row.category),
      toRole: row.recipient_role,
      toActorId: row.recipient_user_id.startsWith('role:') ? undefined : row.recipient_user_id,
      subject: row.title,
      body: row.message,
      deepLink: row.href,
      createdAt: dateTimeIso(row.created_at)
    }));
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createNotificationService(repository: NotificationRepository) {
  return {
    async emit(input: Omit<RosterNotification, 'id' | 'createdAt' | 'readAt'>): Promise<RosterNotification> {
      const timestamp = nowIso();
      const notification = await repository.saveNotification({
        id: randomUUID(),
        createdAt: timestamp,
        ...input
      });
      await repository.saveMockEmail({
        id: randomUUID(),
        schoolId: input.schoolId,
        toRole: input.recipientRole,
        toActorId: input.recipientActorId,
        subject: input.title,
        body: input.body,
        deepLink: input.deepLink,
        createdAt: timestamp
      });
      return notification;
    },

    async listNotifications(schoolId: string): Promise<RosterNotification[]> {
      return repository.listNotifications(schoolId);
    },

    async listMockEmails(schoolId: string): Promise<MockEmailRecord[]> {
      return repository.listMockEmails(schoolId);
    }
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;

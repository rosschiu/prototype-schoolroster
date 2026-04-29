import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPostgresDatabase } from '../../../src/db/postgres.js';
import { createStandaloneAuthService, type AuthenticatedRosterSession } from '../../../src/rostering/auth/auth-service.js';
import { createStandaloneRosterAuthSeed } from '../../../src/rostering/auth/seed.js';
import { createCalendarService, InMemoryCalendarRepository } from '../../../src/rostering/calendar/calendar-service.js';
import { migrateRosteringDatabase } from '../../../src/rostering/db/migrations.js';
import { createLeaveService, InMemoryLeaveRepository } from '../../../src/rostering/leave/leave-service.js';
import { createNotificationService, InMemoryNotificationRepository, PostgresNotificationRepository } from '../../../src/rostering/notifications/notification-service.js';
import { createSessionService } from '../../../src/rostering/timetable/session-service.js';
import { createTimetableService, InMemoryTimetableRepository } from '../../../src/rostering/timetable/timetable-service.js';

async function signedIn(role: 'school_admin' | 'teacher'): Promise<AuthenticatedRosterSession> {
  const auth = createStandaloneAuthService({ seed: await createStandaloneRosterAuthSeed() });
  const created = await auth.signIn({
    email: role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test',
    password: 'Password123!',
    requestedRole: role
  });
  assert.ok(created);
  return created.session;
}

test('leave lifecycle emits local notifications and mock emails with deep links', async () => {
  const admin = await signedIn('school_admin');
  const teacher = await signedIn('teacher');
  const timetableRepository = new InMemoryTimetableRepository();
  const leaveRepository = new InMemoryLeaveRepository();
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = createNotificationService(notificationRepository);
  const timetableService = createTimetableService(timetableRepository);
  const sessionService = createSessionService(timetableRepository);
  const calendarService = createCalendarService(new InMemoryCalendarRepository());
  const created = await timetableService.createFromDefault({
    session: admin,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Notification Timetable' }
  });
  const mondayAm = created.periods.find((period) => period.dayIndex === 1 && period.periodIndex === 1);
  assert.ok(mondayAm);
  await sessionService.create({
    session: admin,
    request: {
      id: 'notification-session',
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: created.timetable.id,
      timetablePeriodId: mondayAm.id,
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      equipmentResourceIds: [],
      assignedTeacherId: 'teacher-demo',
      status: 'published'
    }
  });
  const leaveService = createLeaveService({ leaveRepository, timetableRepository, calendarService, notificationService });

  const leave = await leaveService.apply({
    session: teacher,
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-demo',
    termId: 'term-2026-t1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'am_half_day',
    leaveType: 'sick'
  });
  await leaveService.approve({ session: admin, leaveRequestId: leave.leaveRequest.id });

  const notifications = await notificationService.listNotifications('school-steck-demo');
  assert.deepEqual(notifications.map((item) => item.eventType), ['leave.applied', 'leave.approved']);
  assert.equal(notifications[0].recipientRole, 'school_admin');
  assert.equal(notifications[1].recipientActorId, 'teacher-demo');
  assert.ok(notifications.every((item) => item.deepLink === `/rostering/leave/${leave.leaveRequest.id}`));

  const mockEmails = await notificationService.listMockEmails('school-steck-demo');
  assert.equal(mockEmails.length, 2);
  assert.deepEqual(mockEmails.map((item) => item.deepLink), notifications.map((item) => item.deepLink));
});

test('PostgreSQL notification repository persists notifications and mock emails when DATABASE_URL is available', async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip('DATABASE_URL is not set; PostgreSQL notification repository is covered by live-capable tests.');
    return;
  }

  const schema = `rostering_notification_test_${randomUUID().replaceAll('-', '_')}`;
  const database = createPostgresDatabase(databaseUrl);
  try {
    await migrateRosteringDatabase(database, schema);
    const service = createNotificationService(new PostgresNotificationRepository(database, schema));
    const notification = await service.emit({
      schoolId: 'school-steck-demo',
      recipientRole: 'teacher',
      recipientActorId: 'teacher-demo',
      eventType: 'leave.approved',
      title: 'Leave request approved',
      body: 'Approved',
      deepLink: '/rostering/leave/leave-1',
      entityType: 'leave_request',
      entityId: 'leave-1'
    });

    const notifications = await service.listNotifications('school-steck-demo');
    const emails = await service.listMockEmails('school-steck-demo');
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.id, notification.id);
    assert.equal(notifications[0]?.recipientActorId, 'teacher-demo');
    assert.equal(emails.length, 1);
    assert.equal(emails[0]?.deepLink, '/rostering/leave/leave-1');
  } finally {
    await database.query(`drop schema if exists "${schema}" cascade`);
    await database.close();
  }
});

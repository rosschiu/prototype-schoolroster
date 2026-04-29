import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPostgresDatabase } from '../../../src/db/postgres.js';
import { createStandaloneAuthService, seedPostgresStandaloneAuth, type AuthenticatedRosterSession } from '../../../src/rostering/auth/auth-service.js';
import { createStandaloneRosterAuthSeed } from '../../../src/rostering/auth/seed.js';
import { createCalendarService, InMemoryCalendarRepository, PostgresCalendarRepository } from '../../../src/rostering/calendar/calendar-service.js';
import { migrateRosteringDatabase } from '../../../src/rostering/db/migrations.js';
import { seedPostgresRosteringReferenceData } from '../../../src/rostering/db/seed.js';
import { createLeaveService, InMemoryLeaveRepository, PostgresLeaveRepository } from '../../../src/rostering/leave/leave-service.js';
import { createSessionService } from '../../../src/rostering/timetable/session-service.js';
import { createTimetableService, InMemoryTimetableRepository, PostgresTimetableRepository, TimetableValidationError } from '../../../src/rostering/timetable/timetable-service.js';

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

async function setupLeaveService() {
  const admin = await signedIn('school_admin');
  const teacher = await signedIn('teacher');
  const timetableRepository = new InMemoryTimetableRepository();
  const leaveRepository = new InMemoryLeaveRepository();
  const timetableService = createTimetableService(timetableRepository);
  const sessionService = createSessionService(timetableRepository);
  const calendarService = createCalendarService(new InMemoryCalendarRepository());
  const created = await timetableService.createFromDefault({
    session: admin,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Leave Service Timetable' }
  });
  const monAm = created.periods.find((period) => period.dayIndex === 1 && period.periodIndex === 1);
  const monPm = created.periods.find((period) => period.dayIndex === 1 && period.periodIndex === 5);
  assert.ok(monAm);
  assert.ok(monPm);
  for (const [id, periodId] of [['leave-am', monAm.id], ['leave-pm', monPm.id]] as const) {
    await sessionService.create({
      session: admin,
      request: {
        id,
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: created.timetable.id,
        timetablePeriodId: periodId,
        subjectId: id,
        gradeLevelId: 'P4',
        section: id === 'leave-am' ? 'A' : 'B',
        equipmentResourceIds: [],
        assignedTeacherId: 'teacher-demo',
        status: 'published'
      }
    });
  }
  const leaveService = createLeaveService({ leaveRepository, timetableRepository, calendarService });
  return { admin, teacher, leaveRepository, leaveService };
}

test('teacher applies AM half-day leave and service creates pending request with computed impacts', async () => {
  const { teacher, leaveRepository, leaveService } = await setupLeaveService();

  const result = await leaveService.apply({
    session: teacher,
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-demo',
    termId: 'term-2026-t1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'am_half_day',
    leaveType: 'sick',
    coverageRequired: true
  });

  assert.equal(result.leaveRequest.status, 'pending');
  assert.equal(result.leaveRequest.durationType, 'am_half_day');
  assert.equal(result.impacts.length, 1);
  assert.equal(result.impacts[0].classSessionId, 'leave-am');
  assert.equal(result.impacts[0].coverageStatus, 'unfilled');
  assert.equal(leaveRepository.auditEvents[0]?.action, 'leave.apply');
});

test('admin approves/rejects pending leave and invalid transitions are blocked', async () => {
  const { admin, teacher, leaveRepository, leaveService } = await setupLeaveService();
  const applied = await leaveService.apply({
    session: teacher,
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-demo',
    termId: 'term-2026-t1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'full_day',
    leaveType: 'personal'
  });

  await assert.rejects(() => leaveService.approve({ session: teacher, leaveRequestId: applied.leaveRequest.id }), TimetableValidationError);
  const approved = await leaveService.approve({ session: admin, leaveRequestId: applied.leaveRequest.id });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.reviewedBy, admin.user.userId);
  await assert.rejects(() => leaveService.reject({ session: admin, leaveRequestId: applied.leaveRequest.id }), /Only pending/);
  assert.ok(leaveRepository.auditEvents.some((event) => event.action === 'leave.approve'));
});

test('teacher can cancel own pending leave but not after approval', async () => {
  const { admin, teacher, leaveService } = await setupLeaveService();
  const pending = await leaveService.apply({
    session: teacher,
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-demo',
    termId: 'term-2026-t1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'pm_half_day',
    leaveType: 'appointment',
    coverageRequired: false
  });
  assert.equal(pending.impacts[0].coverageStatus, 'no_coverage_needed');
  const canceled = await leaveService.cancel({ session: teacher, leaveRequestId: pending.leaveRequest.id });
  assert.equal(canceled.status, 'cancelled');

  const second = await leaveService.apply({
    session: teacher,
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-demo',
    termId: 'term-2026-t1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'pm_half_day',
    leaveType: 'appointment'
  });
  await leaveService.approve({ session: admin, leaveRequestId: second.leaveRequest.id });
  await assert.rejects(() => leaveService.cancel({ session: teacher, leaveRequestId: second.leaveRequest.id }), /Only pending/);
});

test('teacher leave list is scoped to own requests', async () => {
  const { admin, teacher, leaveService } = await setupLeaveService();
  await leaveService.apply({
    session: admin,
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-other',
    termId: 'term-2026-t1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'full_day',
    leaveType: 'training',
    adminCreateReason: 'Teacher called reception.'
  });
  await leaveService.apply({
    session: teacher,
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-demo',
    termId: 'term-2026-t1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'full_day',
    leaveType: 'sick'
  });

  const teacherRequests = await leaveService.list({ session: teacher, schoolId: 'school-steck-demo' });
  assert.equal(teacherRequests.length, 1);
  assert.equal(teacherRequests[0].teacherId, 'teacher-demo');
});

test('PostgreSQL leave repository persists leave, impacts, and audit when DATABASE_URL is available', async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip('DATABASE_URL is not set; PostgreSQL leave repository is covered by live-capable tests.');
    return;
  }

  const schema = `rostering_leave_test_${randomUUID().replaceAll('-', '_')}`;
  const database = createPostgresDatabase(databaseUrl);
  try {
    await migrateRosteringDatabase(database, schema);
    const seed = await createStandaloneRosterAuthSeed();
    await seedPostgresStandaloneAuth({ database, schema, seed });
    await seedPostgresRosteringReferenceData({ database, schema });

    const admin = await signedIn('school_admin');
    const teacher = await signedIn('teacher');
    const timetableRepository = new PostgresTimetableRepository(database, schema);
    const timetableService = createTimetableService(timetableRepository);
    const sessionService = createSessionService(timetableRepository);
    const { timetable, periods } = await timetableService.createFromDefault({
      session: admin,
      request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'DB Leave Timetable' }
    });
    const mondayAm = periods.find((period) => period.dayIndex === 1 && period.periodIndex === 1);
    assert.ok(mondayAm);
    await sessionService.create({
      session: admin,
      request: {
        id: 'db-leave-session',
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: timetable.id,
        timetablePeriodId: mondayAm.id,
        subjectId: 'subject-math',
        gradeLevelId: 'p4',
        section: 'A',
        equipmentResourceIds: [],
        assignedTeacherId: 'teacher-demo',
        status: 'published'
      }
    });

    const leaveService = createLeaveService({
      leaveRepository: new PostgresLeaveRepository(database, schema),
      timetableRepository,
      calendarService: createCalendarService(new PostgresCalendarRepository(database, schema))
    });
    const applied = await leaveService.apply({
      session: teacher,
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-demo',
      termId: 'term-2026-t1',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick'
    });
    await leaveService.approve({ session: admin, leaveRequestId: applied.leaveRequest.id });

    const reloadedRepository = new PostgresLeaveRepository(database, schema);
    assert.equal((await reloadedRepository.getLeaveRequest(applied.leaveRequest.id))?.status, 'approved');
    assert.equal((await reloadedRepository.listLeaveImpacts(applied.leaveRequest.id)).length, 1);
    const audit = await database.query<{ count: string }>(
      `select count(*)::text as count from "${schema}"."audit_events" where object_id = $1`,
      [applied.leaveRequest.id]
    );
    assert.equal(audit.rows[0]?.count, '2');
  } finally {
    await database.query(`drop schema if exists "${schema}" cascade`);
    await database.close();
  }
});

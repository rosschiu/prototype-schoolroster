import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStandaloneAuthService } from '../../../src/rostering/auth/auth-service.js';
import { createStandaloneRosterAuthSeed } from '../../../src/rostering/auth/seed.js';
import { createSessionService, detectSessionConflicts } from '../../../src/rostering/timetable/session-service.js';
import {
  InMemoryTimetableRepository,
  TimetableConflictError,
  TimetableValidationError,
  createTimetableService
} from '../../../src/rostering/timetable/timetable-service.js';

async function signedIn(role: 'school_admin' | 'teacher' = 'school_admin') {
  const auth = createStandaloneAuthService({ seed: await createStandaloneRosterAuthSeed() });
  const created = await auth.signIn({
    email: role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test',
    password: 'Password123!',
    requestedRole: role
  });
  assert.ok(created);
  return created.session;
}

async function setup() {
  const repository = new InMemoryTimetableRepository();
  const timetableService = createTimetableService(repository);
  const sessionService = createSessionService(repository);
  const adminSession = await signedIn('school_admin');
  const teacherSession = await signedIn('teacher');
  const { timetable, periods } = await timetableService.createFromDefault({
    session: adminSession,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' }
  });
  const firstPeriod = periods[0];
  const secondPeriod = periods[1];
  assert.ok(firstPeriod);
  assert.ok(secondPeriod);
  return { repository, sessionService, adminSession, teacherSession, timetable, firstPeriod, secondPeriod };
}

test('session service creates, gets, lists, updates, soft-deletes, and audits class sessions', async () => {
  const { repository, sessionService, adminSession, timetable, firstPeriod, secondPeriod } = await setup();

  const created = await sessionService.create({
    session: adminSession,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: firstPeriod.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });

  assert.equal((await sessionService.get({ session: adminSession, sessionId: created.id })).id, created.id);
  assert.equal((await sessionService.list({ session: adminSession, schoolId: 'school-steck-demo', termId: 'term-2026-t1' })).length, 1);

  const updated = await sessionService.update({
    session: adminSession,
    sessionId: created.id,
    patch: {
      timetablePeriodId: secondPeriod.id,
      roomId: 'room-102',
      notes: 'Moved to period 2'
    }
  });

  assert.equal(updated.timetablePeriodId, secondPeriod.id);
  assert.equal(updated.roomId, 'room-102');
  assert.equal(updated.notes, 'Moved to period 2');

  await sessionService.delete({ session: adminSession, sessionId: created.id });
  const deleted = await sessionService.get({ session: adminSession, sessionId: created.id });
  assert.equal(deleted.status, 'cancelled');
  assert.deepEqual(
    repository.auditEvents
      .filter((event) => event.entityType === 'class_session' && event.entityId === created.id)
      .map((event) => event.action),
    ['class_session.create', 'class_session.update', 'class_session.delete']
  );
});

test('session service returns actionable conflict errors for teacher and room double booking', async () => {
  const { sessionService, adminSession, timetable, firstPeriod } = await setup();

  await sessionService.create({
    session: adminSession,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: firstPeriod.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });

  await assert.rejects(
    () => sessionService.create({
      session: adminSession,
      request: {
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: timetable.id,
        timetablePeriodId: firstPeriod.id,
        subjectId: 'subject-english',
        gradeLevelId: 'p5',
        section: 'B',
        roomId: 'room-102',
        assignedTeacherId: 'teacher-demo',
        equipmentResourceIds: []
      }
    }),
    (error) => error instanceof TimetableConflictError && error.message.includes('teacher_double_booked')
  );

  await assert.rejects(
    () => sessionService.create({
      session: adminSession,
      request: {
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: timetable.id,
        timetablePeriodId: firstPeriod.id,
        subjectId: 'subject-science',
        gradeLevelId: 'p6',
        section: 'C',
        roomId: 'room-101',
        assignedTeacherId: 'teacher-other',
        equipmentResourceIds: []
      }
    }),
    (error) => error instanceof TimetableConflictError && error.message.includes('room_double_booked')
  );
});

test('session update ignores its own row but blocks conflicts with other active rows', async () => {
  const { sessionService, adminSession, timetable, firstPeriod, secondPeriod } = await setup();
  const first = await sessionService.create({
    session: adminSession,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: firstPeriod.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });
  await sessionService.create({
    session: adminSession,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: secondPeriod.id,
      subjectId: 'subject-english',
      gradeLevelId: 'p5',
      section: 'B',
      roomId: 'room-102',
      assignedTeacherId: 'teacher-other',
      equipmentResourceIds: []
    }
  });

  await assert.doesNotReject(() => sessionService.update({ session: adminSession, sessionId: first.id, patch: { notes: 'same slot ok' } }));
  await assert.rejects(
    () => sessionService.update({ session: adminSession, sessionId: first.id, patch: { timetablePeriodId: secondPeriod.id, assignedTeacherId: 'teacher-other' } }),
    (error) => error instanceof TimetableConflictError && error.message.includes('teacher_double_booked')
  );
});

test('cancelled sessions are ignored by conflict detector', async () => {
  const { repository, sessionService, adminSession, timetable, firstPeriod } = await setup();
  const cancelled = await sessionService.create({
    session: adminSession,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: firstPeriod.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });
  await sessionService.delete({ session: adminSession, sessionId: cancelled.id });

  const conflicts = await detectSessionConflicts({
    repository,
    candidate: {
      ...cancelled,
      id: 'candidate',
      status: 'draft'
    }
  });
  assert.deepEqual(conflicts, []);
});

test('session service enforces admin and school boundaries', async () => {
  const { sessionService, adminSession, teacherSession, timetable, firstPeriod } = await setup();

  await assert.rejects(
    () => sessionService.create({
      session: teacherSession,
      request: {
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: timetable.id,
        timetablePeriodId: firstPeriod.id,
        subjectId: 'subject-math',
        gradeLevelId: 'p4',
        section: 'A',
        equipmentResourceIds: []
      }
    }),
    TimetableValidationError
  );

  await assert.rejects(
    () => sessionService.list({ session: adminSession, schoolId: 'school-other-demo', termId: 'term-2026-t1' }),
    TimetableValidationError
  );
});

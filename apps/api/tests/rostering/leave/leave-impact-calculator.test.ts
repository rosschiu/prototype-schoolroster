import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStandaloneAuthService } from '../../../src/rostering/auth/auth-service.js';
import { createStandaloneRosterAuthSeed } from '../../../src/rostering/auth/seed.js';
import { createCalendarService, InMemoryCalendarRepository } from '../../../src/rostering/calendar/calendar-service.js';
import { calculateLeaveImpacts } from '../../../src/rostering/leave/leave-impact-calculator.js';
import { createSessionService } from '../../../src/rostering/timetable/session-service.js';
import { createTimetableService, InMemoryTimetableRepository } from '../../../src/rostering/timetable/timetable-service.js';

async function adminSession() {
  const auth = createStandaloneAuthService({ seed: await createStandaloneRosterAuthSeed() });
  const created = await auth.signIn({ email: 'admin@schoolroster.test', password: 'Password123!', requestedRole: 'school_admin' });
  assert.ok(created);
  return created.session;
}

async function setupSchedule() {
  const session = await adminSession();
  const repository = new InMemoryTimetableRepository();
  const timetableService = createTimetableService(repository);
  const sessionService = createSessionService(repository);
  const created = await timetableService.createFromDefault({
    session,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Leave Impact Timetable' }
  });
  const periodByIndex = new Map(created.periods.map((period) => [`${period.dayIndex}-${period.periodIndex}`, period]));
  for (const [id, periodKey, subjectId] of [
    ['session-mon-am', '1-1', 'Math'],
    ['session-mon-pm', '1-5', 'Science'],
    ['session-tue-am', '2-1', 'English']
  ] as const) {
    const period = periodByIndex.get(periodKey);
    assert.ok(period);
    await sessionService.create({
      session,
      request: {
        id,
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: created.timetable.id,
        timetablePeriodId: period.id,
        subjectId,
        gradeLevelId: 'P4',
        section: 'A',
        equipmentResourceIds: [],
        assignedTeacherId: 'teacher-demo',
        status: 'published'
      }
    });
  }
  return { repository, session };
}

test('leave impact calculator handles full-day, AM, and PM durations', async () => {
  const { repository } = await setupSchedule();

  const fullDay = await calculateLeaveImpacts({
    repository,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    teacherId: 'teacher-demo',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'full_day'
  });
  assert.deepEqual(fullDay.impacts.map((impact) => impact.classSession.id).sort(), ['session-mon-am', 'session-mon-pm']);

  const am = await calculateLeaveImpacts({
    repository,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    teacherId: 'teacher-demo',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'am_half_day'
  });
  assert.deepEqual(am.impacts.map((impact) => impact.classSession.id), ['session-mon-am']);

  const pm = await calculateLeaveImpacts({
    repository,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    teacherId: 'teacher-demo',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'pm_half_day'
  });
  assert.deepEqual(pm.impacts.map((impact) => impact.classSession.id), ['session-mon-pm']);
});

test('leave impact calculator excludes no-school dates and honors replacement days', async () => {
  const { repository, session } = await setupSchedule();
  const calendarService = createCalendarService(new InMemoryCalendarRepository());
  await calendarService.createException({
    session,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    exceptionDate: '2026-05-04',
    exceptionType: 'no_school'
  });
  await calendarService.createException({
    session,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    exceptionDate: '2026-05-06',
    exceptionType: 'replacement_day',
    replacementDayIndex: 2
  });

  const result = await calculateLeaveImpacts({
    repository,
    calendarService,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    teacherId: 'teacher-demo',
    startDate: '2026-05-04',
    endDate: '2026-05-06',
    durationType: 'am_half_day'
  });

  assert.deepEqual(result.impacts.map((impact) => `${impact.impactDate}:${impact.classSession.id}`).sort(), [
    '2026-05-05:session-tue-am',
    '2026-05-06:session-tue-am'
  ]);
});

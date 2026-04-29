import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { ROSTER_CSRF_HEADER_NAME } from '../../../src/rostering/auth/auth-service.js';
import { buildRosterApiApp, createDefaultRosterApiServices } from '../../../src/rostering/api/app.js';

let app: FastifyInstance;
let seedCounter = 0;

beforeEach(async () => {
  app = buildRosterApiApp(await createDefaultRosterApiServices());
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function cookieHeaderFrom(response: Awaited<ReturnType<FastifyInstance['inject']>>): string {
  const setCookie = response.headers['set-cookie'];
  return (Array.isArray(setCookie) ? setCookie : [setCookie])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function signIn(role: 'school_admin' | 'teacher') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    payload: {
      email: role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test',
      password: 'Password123!',
      requestedRole: role
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: cookieHeaderFrom(response), csrfToken: response.json().session.csrfToken as string };
}

async function seedUnfilledCoverage(adminAuth: { cookie: string; csrfToken: string }) {
  seedCounter += 1;
  const suffix = String(seedCounter);
  const timetable = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: `Coverage Queue Timetable ${suffix}` }
  });
  assert.equal(timetable.statusCode, 201, timetable.body);
  const period = timetable.json().periods.find((item: { dayIndex: number; periodIndex: number }) => item.dayIndex === 1 && item.periodIndex === 1);
  assert.ok(period);
  const session = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      id: `coverage-target-${suffix}`,
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.json().timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-coverage',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: [],
      status: 'published'
    }
  });
  assert.equal(session.statusCode, 201, session.body);
  const leave = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick',
      coverageRequired: true,
      adminCreateReason: 'Teacher called office.'
    }
  });
  assert.equal(leave.statusCode, 201, leave.body);
  return { leaveId: leave.json().leaveRequest.id as string, impactId: leave.json().impacts[0].id as string, sessionId: session.json().session.id as string };
}

test('admin lists unfilled coverage and resolved items leave queue', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, impactId, sessionId } = await seedUnfilledCoverage(adminAuth);

  const listed = await app.inject({
    method: 'GET',
    url: '/api/roster/coverage/unfilled?schoolId=school-steck-demo&termId=term-2026-t1',
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().items.length, 1);
  assert.equal(listed.json().items[0].impact.id, impactId);
  assert.equal(listed.json().items[0].classSession.id, sessionId);

  const resolved = await app.inject({
    method: 'PATCH',
    url: `/api/roster/leave/${leaveId}/impacts`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      adjustmentReason: 'No substitute needed for supervised activity.',
      updateCoverage: [{ impactId, coverageRequired: false }]
    }
  });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal(resolved.json().impacts[0].coverageStatus, 'no_coverage_needed');

  const empty = await app.inject({
    method: 'GET',
    url: '/api/roster/coverage/unfilled?schoolId=school-steck-demo&termId=term-2026-t1',
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(empty.statusCode, 200, empty.body);
  assert.equal(empty.json().items.length, 0);
});

test('teacher cannot view unfilled coverage queue', async () => {
  const teacherAuth = await signIn('teacher');
  const denied = await app.inject({
    method: 'GET',
    url: '/api/roster/coverage/unfilled?schoolId=school-steck-demo',
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(denied.statusCode, 400, denied.body);
  assert.match(denied.json().message, /Only school admins/);
});

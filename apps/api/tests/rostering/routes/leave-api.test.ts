import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { ROSTER_CSRF_HEADER_NAME } from '../../../src/rostering/auth/auth-service.js';
import { buildRosterApiApp, createDefaultRosterApiServices } from '../../../src/rostering/api/app.js';

let app: FastifyInstance;

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

async function seedPublishedSchedule(adminAuth: { cookie: string; csrfToken: string }) {
  const timetable = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Leave API Timetable' }
  });
  assert.equal(timetable.statusCode, 201, timetable.body);
  const body = timetable.json();
  const monAm = body.periods.find((period: { dayIndex: number; periodIndex: number }) => period.dayIndex === 1 && period.periodIndex === 1);
  const monPm = body.periods.find((period: { dayIndex: number; periodIndex: number }) => period.dayIndex === 1 && period.periodIndex === 5);
  assert.ok(monAm);
  assert.ok(monPm);

  for (const [id, periodId, subjectId, section] of [
    ['api-leave-am', monAm.id, 'Math', 'A'],
    ['api-leave-pm', monPm.id, 'Science', 'B']
  ] as const) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/roster/sessions',
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: {
        id,
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: body.timetable.id,
        timetablePeriodId: periodId,
        subjectId,
        gradeLevelId: 'P4',
        section,
        roomId: id === 'api-leave-am' ? 'room-api-a' : 'room-api-b',
        assignedTeacherId: 'teacher-demo',
        equipmentResourceIds: [],
        status: 'published'
      }
    });
    assert.equal(response.statusCode, 201, response.body);
  }
}

test('teacher creates leave, lists own leave, and admin approves through API', async () => {
  const adminAuth = await signIn('school_admin');
  const teacherAuth = await signIn('teacher');
  await seedPublishedSchedule(adminAuth);

  const created = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick',
      coverageRequired: true
    }
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().leaveRequest.status, 'pending');
  assert.equal(created.json().impacts.length, 1);
  assert.equal(created.json().impacts[0].classSessionId, 'api-leave-am');

  const listed = await app.inject({
    method: 'GET',
    url: '/api/roster/leave?schoolId=school-steck-demo',
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().leaveRequests.length, 1);

  const approved = await app.inject({
    method: 'POST',
    url: `/api/roster/leave/${created.json().leaveRequest.id}/approve`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken }
  });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(approved.json().leaveRequest.status, 'approved');
});

test('admin adjusts leave impacts with audit reason and teacher is denied', async () => {
  const adminAuth = await signIn('school_admin');
  const teacherAuth = await signIn('teacher');
  await seedPublishedSchedule(adminAuth);

  const created = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'appointment'
    }
  });
  assert.equal(created.statusCode, 201, created.body);
  const leaveId = created.json().leaveRequest.id as string;
  const initialImpactId = created.json().impacts[0].id as string;

  const teacherPatch = await app.inject({
    method: 'PATCH',
    url: `/api/roster/leave/${leaveId}/impacts`,
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: { adjustmentReason: 'Teacher attempt', removeImpactIds: [initialImpactId] }
  });
  assert.equal(teacherPatch.statusCode, 400);

  const adjusted = await app.inject({
    method: 'PATCH',
    url: `/api/roster/leave/${leaveId}/impacts`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      adjustmentReason: 'PM lesson also needs coverage',
      add: [{ classSessionId: 'api-leave-pm', impactDate: '2026-05-04', coverageRequired: false }],
      updateCoverage: [{ impactId: initialImpactId, coverageRequired: false }]
    }
  });
  assert.equal(adjusted.statusCode, 200, adjusted.body);
  const impacts = adjusted.json().impacts;
  assert.equal(impacts.length, 2);
  assert.equal(impacts.filter((impact: { coverageStatus: string }) => impact.coverageStatus === 'no_coverage_needed').length, 2);

  const missingReason = await app.inject({
    method: 'PATCH',
    url: `/api/roster/leave/${leaveId}/impacts`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { removeImpactIds: [initialImpactId] }
  });
  assert.equal(missingReason.statusCode, 400);
});

test('admin creates leave for a teacher only with an audit reason', async () => {
  const adminAuth = await signIn('school_admin');
  const teacherAuth = await signIn('teacher');
  await seedPublishedSchedule(adminAuth);

  const missingReason = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'pm_half_day',
      leaveType: 'appointment'
    }
  });
  assert.equal(missingReason.statusCode, 400);
  assert.match(missingReason.json().message, /adminCreateReason/);

  const created = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'pm_half_day',
      leaveType: 'appointment',
      adminCreateReason: 'Teacher phoned the office.'
    }
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().leaveRequest.createdBy, 'user-admin-demo');
  assert.equal(created.json().impacts.length, 1);
  assert.equal(created.json().impacts[0].classSessionId, 'api-leave-pm');

  const visibleToTeacher = await app.inject({
    method: 'GET',
    url: '/api/roster/leave?schoolId=school-steck-demo',
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(visibleToTeacher.statusCode, 200, visibleToTeacher.body);
  assert.equal(visibleToTeacher.json().leaveRequests.some((item: { id: string }) => item.id === created.json().leaveRequest.id), true);
});

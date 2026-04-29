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

async function seedCoverageCase(adminAuth: { cookie: string; csrfToken: string }) {
  const timetable = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Rule Config Convergence Timetable' }
  });
  assert.equal(timetable.statusCode, 201, timetable.body);
  const timetableBody = timetable.json();
  const period = timetableBody.periods.find((item: { dayIndex: number; periodIndex: number }) => item.dayIndex === 1 && item.periodIndex === 1);
  assert.ok(period);

  const session = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      id: 'rule-convergence-session',
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-rule-convergence',
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
  return { leaveId: leave.json().leaveRequest.id as string, sessionId: session.json().session.id as string, periodId: period.id as string };
}

test('rule config, teacher availability, and recommendations converge end-to-end', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId, periodId } = await seedCoverageCase(adminAuth);

  const rules = await app.inject({
    method: 'PATCH',
    url: '/api/roster/rules',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      rules: [
        { criteriaKey: 'workload_balance', weight: 1, enabled: true },
        { criteriaKey: 'subject_competency', weight: 0, enabled: false },
        { criteriaKey: 'class_familiarity', weight: 0, enabled: false },
        { criteriaKey: 'recency_penalty', weight: 0, enabled: false },
        { criteriaKey: 'preference_policy', weight: 0, enabled: false }
      ]
    }
  });
  assert.equal(rules.statusCode, 200, rules.body);

  const availability = await app.inject({
    method: 'PATCH',
    url: '/api/roster/availability',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-sub-b',
      records: [{ date: '2026-05-04', timetablePeriodId: periodId, availabilityStatus: 'unavailable' }]
    }
  });
  assert.equal(availability.statusCode, 200, availability.body);

  const recommended = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(recommended.statusCode, 200, recommended.body);
  const body = recommended.json();
  assert.equal(body.status, 'completed');
  assert.ok(body.recommendations.length >= 1);
  assert.equal(body.recommendations[0].breakdown.workload_balance.weight, 1);
  assert.equal(body.recommendations[0].breakdown.subject_competency.weight, 0);
  assert.equal(body.recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-b'), false);
});


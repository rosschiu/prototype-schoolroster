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

async function signIn(role: 'school_admin' | 'teacher', email?: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    payload: {
      email: email ?? (role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test'),
      password: 'Password123!',
      requestedRole: role
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: cookieHeaderFrom(response), csrfToken: response.json().session.csrfToken as string };
}

async function seedReportFixture() {
  const admin = await signIn('school_admin');
  const teacher = await signIn('teacher');
  const timetable = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: admin.cookie, [ROSTER_CSRF_HEADER_NAME]: admin.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Reports Timetable' }
  });
  assert.equal(timetable.statusCode, 201, timetable.body);
  const timetableBody = timetable.json();
  const mondayAm = timetableBody.periods.find((period: { dayIndex: number; periodIndex: number }) => period.dayIndex === 1 && period.periodIndex === 1);
  assert.ok(mondayAm);

  const session = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: admin.cookie, [ROSTER_CSRF_HEADER_NAME]: admin.csrfToken },
    payload: {
      id: 'report-session-math',
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: mondayAm.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-report-a',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });
  assert.equal(session.statusCode, 201, session.body);

  const published = await app.inject({
    method: 'POST',
    url: `/api/roster/timetables/${timetableBody.timetable.id}/publish`,
    headers: { cookie: admin.cookie, [ROSTER_CSRF_HEADER_NAME]: admin.csrfToken }
  });
  assert.equal(published.statusCode, 200, published.body);

  const leave = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: teacher.cookie, [ROSTER_CSRF_HEADER_NAME]: teacher.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick',
      reason: 'Report fixture'
    }
  });
  assert.equal(leave.statusCode, 201, leave.body);
  const leaveId = leave.json().leaveRequest.id as string;

  const approved = await app.inject({
    method: 'POST',
    url: `/api/roster/leave/${leaveId}/approve`,
    headers: { cookie: admin.cookie, [ROSTER_CSRF_HEADER_NAME]: admin.csrfToken }
  });
  assert.equal(approved.statusCode, 200, approved.body);

  const offered = await app.inject({
    method: 'POST',
    url: '/api/roster/substitutes',
    headers: { cookie: admin.cookie, [ROSTER_CSRF_HEADER_NAME]: admin.csrfToken },
    payload: { leaveId, sessionId: 'report-session-math', substituteTeacherId: 'teacher-sub-b' }
  });
  assert.equal(offered.statusCode, 201, offered.body);
  return { admin, teacher, leaveId, assignmentId: offered.json().assignment.id as string };
}

test('admin views workload, leave summary, and substitute history reports', async () => {
  const { admin, teacher, assignmentId } = await seedReportFixture();

  const workload = await app.inject({
    method: 'GET',
    url: '/api/roster/reports/workload?schoolId=school-steck-demo&termId=term-2026-t1',
    headers: { cookie: admin.cookie }
  });
  assert.equal(workload.statusCode, 200, workload.body);
  const workloadRows = workload.json().report.rows as Array<{ teacherId: string; regularSessionCount: number; substituteDutyCount: number; totalWorkloadCount: number }>;
  assert.deepEqual(workloadRows.find((row) => row.teacherId === 'teacher-demo'), { teacherId: 'teacher-demo', regularSessionCount: 1, substituteDutyCount: 0, totalWorkloadCount: 1 });
  assert.deepEqual(workloadRows.find((row) => row.teacherId === 'teacher-sub-b'), { teacherId: 'teacher-sub-b', regularSessionCount: 0, substituteDutyCount: 1, totalWorkloadCount: 1 });

  const leaveSummary = await app.inject({
    method: 'GET',
    url: '/api/roster/reports/leave-summary?schoolId=school-steck-demo&termId=term-2026-t1&startDate=2026-05-01&endDate=2026-05-31',
    headers: { cookie: admin.cookie }
  });
  assert.equal(leaveSummary.statusCode, 200, leaveSummary.body);
  assert.deepEqual(leaveSummary.json().report.rows, [
    { teacherId: 'teacher-demo', leaveType: 'sick', durationType: 'am_half_day', requestCount: 1, coverageImpactCount: 1 }
  ]);

  const history = await app.inject({
    method: 'GET',
    url: '/api/roster/reports/substitute-history?schoolId=school-steck-demo&termId=term-2026-t1&teacherId=teacher-sub-b',
    headers: { cookie: admin.cookie }
  });
  assert.equal(history.statusCode, 200, history.body);
  assert.equal(history.json().report.rows.length, 1);
  assert.equal(history.json().report.rows[0].assignmentId, assignmentId);
  assert.equal(history.json().report.rows[0].substituteTeacherId, 'teacher-sub-b');
  assert.equal(history.json().report.rows[0].originalTeacherId, 'teacher-demo');

  const coverage = await app.inject({
    method: 'GET',
    url: '/api/roster/reports/coverage-operations?schoolId=school-steck-demo&termId=term-2026-t1',
    headers: { cookie: admin.cookie }
  });
  assert.equal(coverage.statusCode, 200, coverage.body);
  assert.equal(coverage.json().report.totalRequiredImpacts, 1);
  assert.equal(coverage.json().report.filledImpactCount, 1);
  assert.equal(coverage.json().report.unfilledImpactCount, 0);
  assert.equal(coverage.json().report.fillRate, 1);

  const csv = await app.inject({
    method: 'GET',
    url: '/api/roster/reports/workload/export?schoolId=school-steck-demo&termId=term-2026-t1',
    headers: { cookie: admin.cookie }
  });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(String(csv.headers['content-type']), /text\/csv/);
  assert.match(csv.body, /^﻿Teacher ID,Regular Sessions,Substitute Duties,Total Workload/);
  assert.match(csv.body, /teacher-sub-b,0,1,1/);

  const denied = await app.inject({
    method: 'GET',
    url: '/api/roster/reports/workload?schoolId=school-steck-demo&termId=term-2026-t1',
    headers: { cookie: teacher.cookie }
  });
  assert.equal(denied.statusCode, 400);
  assert.match(denied.json().message, /school admins/);
});

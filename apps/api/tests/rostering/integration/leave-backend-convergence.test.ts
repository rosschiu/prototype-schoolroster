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

type Auth = { cookie: string; csrfToken: string };
type SeededSchedule = {
  termId: string;
  sessionIds: {
    mondayAm: string;
    mondayPm: string;
    tuesdayAm: string;
  };
};

function cookieHeaderFrom(response: Awaited<ReturnType<FastifyInstance['inject']>>): string {
  const setCookie = response.headers['set-cookie'];
  return (Array.isArray(setCookie) ? setCookie : [setCookie])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function signIn(email: string, role: 'school_admin' | 'teacher'): Promise<Auth> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    payload: {
      email,
      password: 'Password123!',
      requestedRole: role
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: cookieHeaderFrom(response), csrfToken: response.json().session.csrfToken as string };
}

async function createPublishedSchedule(adminAuth: Auth, termId: string): Promise<SeededSchedule> {
  const timetableResponse = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId,
      name: `Leave convergence ${termId}`
    }
  });
  assert.equal(timetableResponse.statusCode, 201, timetableResponse.body);
  const timetableBody = timetableResponse.json();
  const mondayAm = timetableBody.periods.find((period: { dayIndex: number; periodIndex: number }) => period.dayIndex === 1 && period.periodIndex === 1);
  const mondayPm = timetableBody.periods.find((period: { dayIndex: number; periodIndex: number }) => period.dayIndex === 1 && period.periodIndex === 5);
  const tuesdayAm = timetableBody.periods.find((period: { dayIndex: number; periodIndex: number }) => period.dayIndex === 2 && period.periodIndex === 1);
  assert.ok(mondayAm);
  assert.ok(mondayPm);
  assert.ok(tuesdayAm);

  const sessionSeeds = [
    ['leave-conv-mon-am', mondayAm.id, 'subject-math', 'A', 'room-101'],
    ['leave-conv-mon-pm', mondayPm.id, 'subject-science', 'B', 'room-102'],
    ['leave-conv-tue-am', tuesdayAm.id, 'subject-english', 'C', 'room-103']
  ] as const;

  for (const [id, periodId, subjectId, section, roomId] of sessionSeeds) {
    const created = await app.inject({
      method: 'POST',
      url: '/api/roster/sessions',
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: {
        id: `${id}-${termId}`,
        schoolId: 'school-steck-demo',
        termId,
        timetableId: timetableBody.timetable.id,
        timetablePeriodId: periodId,
        subjectId,
        gradeLevelId: 'P4',
        section,
        roomId,
        assignedTeacherId: 'teacher-demo',
        equipmentResourceIds: [],
        status: 'published'
      }
    });
    assert.equal(created.statusCode, 201, created.body);
  }

  return {
    termId,
    sessionIds: {
      mondayAm: `leave-conv-mon-am-${termId}`,
      mondayPm: `leave-conv-mon-pm-${termId}`,
      tuesdayAm: `leave-conv-tue-am-${termId}`
    }
  };
}

async function applyLeave(teacherAuth: Auth, schedule: SeededSchedule, payload: Partial<Record<string, unknown>> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: schedule.termId,
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'full_day',
      leaveType: 'sick',
      coverageRequired: true,
      ...payload
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

test('full-day leave creates every published impacted session across the date range', async () => {
  const adminAuth = await signIn('admin@schoolroster.test', 'school_admin');
  const teacherAuth = await signIn('teacher@schoolroster.test', 'teacher');
  const schedule = await createPublishedSchedule(adminAuth, 'term-leave-full-day');

  const created = await applyLeave(teacherAuth, schedule, {
    startDate: '2026-05-04',
    endDate: '2026-05-05',
    durationType: 'full_day'
  });

  assert.equal(created.leaveRequest.status, 'pending');
  assert.equal(created.impacts.length, 3);
  assert.deepEqual(
    new Set(created.impacts.map((impact: { classSessionId: string }) => impact.classSessionId)),
    new Set([schedule.sessionIds.mondayAm, schedule.sessionIds.mondayPm, schedule.sessionIds.tuesdayAm])
  );
  assert.ok(created.impacts.every((impact: { coverageStatus: string; status: string }) => impact.coverageStatus === 'unfilled' && impact.status === 'active'));
});

test('AM and PM half-day leave only create impacts for the matching half of day', async () => {
  const adminAuth = await signIn('admin@schoolroster.test', 'school_admin');
  const teacherAuth = await signIn('teacher@schoolroster.test', 'teacher');
  const schedule = await createPublishedSchedule(adminAuth, 'term-leave-half-day');

  const amLeave = await applyLeave(teacherAuth, schedule, { durationType: 'am_half_day' });
  const pmLeave = await applyLeave(teacherAuth, schedule, { durationType: 'pm_half_day', leaveType: 'appointment' });

  assert.deepEqual(amLeave.impacts.map((impact: { classSessionId: string }) => impact.classSessionId), [schedule.sessionIds.mondayAm]);
  assert.deepEqual(pmLeave.impacts.map((impact: { classSessionId: string }) => impact.classSessionId), [schedule.sessionIds.mondayPm]);
});

test('admin impact adjustment is enforced through routes and reflected on impacts', async () => {
  const adminAuth = await signIn('admin@schoolroster.test', 'school_admin');
  const teacherAuth = await signIn('teacher@schoolroster.test', 'teacher');
  const schedule = await createPublishedSchedule(adminAuth, 'term-leave-adjust');
  const created = await applyLeave(teacherAuth, schedule, { durationType: 'am_half_day' });
  const leaveId = created.leaveRequest.id as string;
  const originalImpactId = created.impacts[0].id as string;

  const teacherPatch = await app.inject({
    method: 'PATCH',
    url: `/api/roster/leave/${leaveId}/impacts`,
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: { adjustmentReason: 'Teacher tries to remove coverage', removeImpactIds: [originalImpactId] }
  });
  assert.equal(teacherPatch.statusCode, 400);

  const adjusted = await app.inject({
    method: 'PATCH',
    url: `/api/roster/leave/${leaveId}/impacts`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      adjustmentReason: 'PM class needs manual coverage review',
      add: [{ classSessionId: schedule.sessionIds.mondayPm, impactDate: '2026-05-04', coverageRequired: true }],
      updateCoverage: [{ impactId: originalImpactId, coverageRequired: false }]
    }
  });
  assert.equal(adjusted.statusCode, 200, adjusted.body);
  const impacts = adjusted.json().impacts as Array<{ classSessionId: string; coverageStatus: string; source: string; adminAdjustmentReason?: string; adjustedBy?: string }>;
  assert.equal(impacts.length, 2);
  assert.ok(impacts.some((impact) => impact.classSessionId === schedule.sessionIds.mondayAm && impact.coverageStatus === 'no_coverage_needed'));
  assert.ok(impacts.some((impact) => impact.classSessionId === schedule.sessionIds.mondayPm && impact.source === 'admin_added'));
  assert.ok(impacts.every((impact) => impact.adminAdjustmentReason === 'PM class needs manual coverage review'));
  assert.ok(impacts.every((impact) => impact.adjustedBy === 'user-admin-demo'));
});

test('reject and cancel close active leave impacts and block later impact adjustment', async () => {
  const adminAuth = await signIn('admin@schoolroster.test', 'school_admin');
  const teacherAuth = await signIn('teacher@schoolroster.test', 'teacher');
  const schedule = await createPublishedSchedule(adminAuth, 'term-leave-close');

  const rejectedLeave = await applyLeave(teacherAuth, schedule, { durationType: 'full_day', leaveType: 'personal' });
  const rejectResponse = await app.inject({
    method: 'POST',
    url: `/api/roster/leave/${rejectedLeave.leaveRequest.id}/reject`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken }
  });
  assert.equal(rejectResponse.statusCode, 200, rejectResponse.body);
  assert.equal(rejectResponse.json().leaveRequest.status, 'rejected');

  const rejectedImpacts = await app.inject({
    method: 'GET',
    url: `/api/roster/leave/${rejectedLeave.leaveRequest.id}/impacts`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(rejectedImpacts.statusCode, 200, rejectedImpacts.body);
  assert.ok(rejectedImpacts.json().impacts.every((impact: { status: string; coverageStatus: string }) => impact.status === 'inactive' && impact.coverageStatus === 'cancelled'));

  const adjustRejected = await app.inject({
    method: 'PATCH',
    url: `/api/roster/leave/${rejectedLeave.leaveRequest.id}/impacts`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { adjustmentReason: 'Too late', removeImpactIds: [rejectedLeave.impacts[0].id] }
  });
  assert.equal(adjustRejected.statusCode, 400);

  const cancelledLeave = await applyLeave(teacherAuth, schedule, { durationType: 'pm_half_day', leaveType: 'appointment' });
  const cancelResponse = await app.inject({
    method: 'POST',
    url: `/api/roster/leave/${cancelledLeave.leaveRequest.id}/cancel`,
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken }
  });
  assert.equal(cancelResponse.statusCode, 200, cancelResponse.body);
  assert.equal(cancelResponse.json().leaveRequest.status, 'cancelled');

  const cancelledImpacts = await app.inject({
    method: 'GET',
    url: `/api/roster/leave/${cancelledLeave.leaveRequest.id}/impacts`,
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(cancelledImpacts.statusCode, 200, cancelledImpacts.body);
  assert.ok(cancelledImpacts.json().impacts.every((impact: { status: string; coverageStatus: string }) => impact.status === 'inactive' && impact.coverageStatus === 'cancelled'));
});

test('leave convergence preserves auth, CSRF, self-service, and tenant boundaries', async () => {
  const adminAuth = await signIn('admin@schoolroster.test', 'school_admin');
  const teacherAuth = await signIn('teacher@schoolroster.test', 'teacher');
  const otherAdminAuth = await signIn('other-admin@schoolroster.test', 'school_admin');
  const schedule = await createPublishedSchedule(adminAuth, 'term-leave-security');

  const noCookie = await app.inject({
    method: 'GET',
    url: '/api/roster/leave?schoolId=school-steck-demo'
  });
  assert.equal(noCookie.statusCode, 401);

  const noCsrf = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: teacherAuth.cookie },
    payload: {
      schoolId: 'school-steck-demo',
      termId: schedule.termId,
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick'
    }
  });
  assert.equal(noCsrf.statusCode, 400);
  assert.match(noCsrf.json().message, /CSRF/);

  const teacherForOtherTeacher = await app.inject({
    method: 'POST',
    url: '/api/roster/leave',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: schedule.termId,
      teacherId: 'teacher-other',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick'
    }
  });
  assert.equal(teacherForOtherTeacher.statusCode, 400);

  const otherTenantList = await app.inject({
    method: 'GET',
    url: '/api/roster/leave?schoolId=school-steck-demo',
    headers: { cookie: otherAdminAuth.cookie }
  });
  assert.equal(otherTenantList.statusCode, 400);
});

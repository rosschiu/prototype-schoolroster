import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { ROSTER_CSRF_HEADER_NAME } from '../../../src/rostering/auth/auth-service.js';
import { buildRosterApiApp, createDefaultRosterApiServices } from '../../../src/rostering/api/app.js';
import { InMemoryNotificationRepository } from '../../../src/rostering/notifications/notification-service.js';
import { InMemorySubstituteAssignmentRepository } from '../../../src/rostering/substitute-assignments/substitute-assignment-service.js';

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

async function signIn(role: 'school_admin' | 'teacher', targetApp = app, email?: string) {
  const response = await targetApp.inject({
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

async function seedLeaveNeedingCoverage(adminAuth: { cookie: string; csrfToken: string }, targetApp = app) {
  seedCounter += 1;
  const suffix = String(seedCounter);
  const timetable = await targetApp.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: `Substitute Recommendation Timetable ${suffix}` }
  });
  assert.equal(timetable.statusCode, 201, timetable.body);
  const body = timetable.json();
  const period = body.periods.find((item: { dayIndex: number; periodIndex: number }) => item.dayIndex === 1 && item.periodIndex === 1);
  assert.ok(period);

  const target = await targetApp.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      id: `sub-rec-target-${suffix}`,
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: body.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-sub-target',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: [],
      status: 'published'
    }
  });
  assert.equal(target.statusCode, 201, target.body);

  const doubleBooked = await targetApp.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      id: `sub-rec-double-booked-${suffix}`,
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: body.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'Science',
      gradeLevelId: 'P5',
      section: 'B',
      roomId: 'room-sub-other',
      assignedTeacherId: 'teacher-sub-a',
      equipmentResourceIds: [],
      status: 'published'
    }
  });
  assert.equal(doubleBooked.statusCode, 201, doubleBooked.body);

  const leave = await targetApp.inject({
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
  assert.equal(leave.json().impacts.length, 1);
  return { leaveId: leave.json().leaveRequest.id as string, sessionId: target.json().session.id as string, periodId: period.id as string };
}

test('admin fetches ranked substitute recommendations with explainability breakdown', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth);

  const response = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.status, 'completed');
  assert.equal(typeof body.job_id, 'string');
  assert.ok(body.recommendations.length >= 1);
  assert.equal(body.recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-demo'), false);
  assert.equal(body.recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-a'), false);
  assert.equal(body.recommendations[0].rank, 1);
  assert.equal(typeof body.recommendations[0].composite_score, 'number');
  assert.ok(body.recommendations[0].breakdown.workload_balance);
  assert.ok(body.recommendations[0].breakdown.subject_competency);
  assert.ok(body.recommendations[0].raw_inputs);
});

test('rule config API persists weights and recommendation scoring consumes enabled criteria', async () => {
  const adminAuth = await signIn('school_admin');
  const listed = await app.inject({
    method: 'GET',
    url: '/api/roster/rules?schoolId=school-steck-demo',
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().rules.some((rule: { criteriaKey: string }) => rule.criteriaKey === 'workload_balance'), true);

  const patched = await app.inject({
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
  assert.equal(patched.statusCode, 200, patched.body);
  assert.equal(patched.json().rules.find((rule: { criteriaKey: string }) => rule.criteriaKey === 'workload_balance').weight, 1);

  const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth);
  const recommended = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(recommended.statusCode, 200, recommended.body);
  const first = recommended.json().recommendations[0];
  assert.equal(first.breakdown.workload_balance.weight, 1);
  assert.equal(first.breakdown.subject_competency.weight, 0);
});

test('rule config API enforces admin permission and validation', async () => {
  const teacherAuth = await signIn('teacher');
  const denied = await app.inject({
    method: 'GET',
    url: '/api/roster/rules?schoolId=school-steck-demo',
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(denied.statusCode, 400, denied.body);
  assert.match(denied.json().message, /Only school admins/);

  const adminAuth = await signIn('school_admin');
  const invalid = await app.inject({
    method: 'PATCH',
    url: '/api/roster/rules',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', rules: [{ criteriaKey: 'workload_balance', weight: -0.1, enabled: true }] }
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
  assert.match(invalid.json().message, /between 0 and 1/);
});

test('preference rule API boosts preferred candidates and hard-excludes matching teachers', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth);

  const enabledPreference = await app.inject({
    method: 'PATCH',
    url: '/api/roster/rules',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      rules: [{ criteriaKey: 'preference_policy', weight: 1, enabled: true }]
    }
  });
  assert.equal(enabledPreference.statusCode, 200, enabledPreference.body);

  const preferences = await app.inject({
    method: 'PATCH',
    url: '/api/roster/preferences',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      rules: [
        {
          id: 'prefer-sub-b-math-p4',
          substituteTeacherId: 'teacher-sub-b',
          scope: 'subject_grade',
          preferenceType: 'preferred',
          subjectId: 'Math',
          gradeLevelId: 'P4',
          weight: 0.4,
          reason: 'Preferred P4 Math cover'
        },
        {
          id: 'exclude-multirole-school',
          substituteTeacherId: 'teacher-multirole-demo',
          scope: 'school',
          preferenceType: 'hard_exclusion',
          reason: 'Not used for cover'
        }
      ]
    }
  });
  assert.equal(preferences.statusCode, 200, preferences.body);

  const response = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(response.statusCode, 200, response.body);
  const recommendations = response.json().recommendations;
  const preferred = recommendations.find((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-b');
  assert.ok(preferred);
  assert.equal(preferred.breakdown.preference_policy.score, 0.9);
  assert.deepEqual(preferred.breakdown.preference_policy.rule_ids, ['prefer-sub-b-math-p4']);
  assert.equal(recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-multirole-demo'), false);
});

test('preference rules apply the strongest matching scope only', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth);

  const enabledPreference = await app.inject({
    method: 'PATCH',
    url: '/api/roster/rules',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      rules: [{ criteriaKey: 'preference_policy', weight: 1, enabled: true }]
    }
  });
  assert.equal(enabledPreference.statusCode, 200, enabledPreference.body);

  const preferences = await app.inject({
    method: 'PATCH',
    url: '/api/roster/preferences',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      rules: [
        {
          id: 'prefer-sub-b-subject',
          substituteTeacherId: 'teacher-sub-b',
          scope: 'subject',
          preferenceType: 'preferred',
          subjectId: 'Math',
          weight: 0.4,
          reason: 'Preferred for Math generally'
        },
        {
          id: 'avoid-sub-b-session',
          substituteTeacherId: 'teacher-sub-b',
          scope: 'schedule_session',
          preferenceType: 'soft_avoid',
          scheduleSessionId: sessionId,
          weight: 0.25,
          reason: 'Avoid this exact session'
        }
      ]
    }
  });
  assert.equal(preferences.statusCode, 200, preferences.body);

  const response = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(response.statusCode, 200, response.body);
  const preferred = response.json().recommendations.find((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-b');
  assert.ok(preferred);
  assert.equal(preferred.breakdown.preference_policy.score, 0.25);
  assert.deepEqual(preferred.breakdown.preference_policy.rule_ids, ['avoid-sub-b-session']);
});

test('recommendation API supports async-style job polling', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth);

  const queued = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}&async=true`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(queued.statusCode, 200, queued.body);
  assert.equal(queued.json().status, 'running');
  assert.equal(queued.json().recommendations.length, 0);

  const polled = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommendations/${queued.json().job_id}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(polled.statusCode, 200, polled.body);
  assert.equal(polled.json().job.status, 'completed');
  assert.ok(polled.json().job.result.recommendations.length >= 1);

  const retry = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}&async=true`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().job_id, queued.json().job_id);
  assert.equal(retry.json().status, 'completed');
  assert.ok(retry.json().recommendations.length >= 1);
});

test('availability API persists overrides and filters unavailable candidates from recommendations', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId, periodId } = await seedLeaveNeedingCoverage(adminAuth);

  const patched = await app.inject({
    method: 'PATCH',
    url: '/api/roster/availability',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-sub-b',
      records: [{
        date: '2026-05-04',
        timetablePeriodId: periodId,
        availabilityStatus: 'unavailable',
        reason: 'Training'
      }]
    }
  });
  assert.equal(patched.statusCode, 200, patched.body);
  assert.equal(patched.json().availability[0].availabilityStatus, 'unavailable');

  const listed = await app.inject({
    method: 'GET',
    url: '/api/roster/availability?schoolId=school-steck-demo&teacherId=teacher-sub-b&startDate=2026-05-04&endDate=2026-05-04',
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().availability.length, 1);

  const response = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-b'), false);
});

test('teacher availability restoration can make an otherwise eligible teacher recommendable again', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId, periodId } = await seedLeaveNeedingCoverage(adminAuth);

  const unavailable = await app.inject({
    method: 'PATCH',
    url: '/api/roster/availability',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-sub-b',
      records: [{
        date: '2026-05-04',
        timetablePeriodId: periodId,
        availabilityStatus: 'unavailable',
        reason: 'Training'
      }]
    }
  });
  assert.equal(unavailable.statusCode, 200, unavailable.body);

  const filtered = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(filtered.statusCode, 200, filtered.body);
  assert.equal(filtered.json().recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-b'), false);

  const restored = await app.inject({
    method: 'PATCH',
    url: '/api/roster/availability',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-sub-b',
      records: [{
        date: '2026-05-04',
        timetablePeriodId: periodId,
        availabilityStatus: 'available',
        reason: 'Training cancelled'
      }]
    }
  });
  assert.equal(restored.statusCode, 200, restored.body);

  const recommended = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(recommended.statusCode, 200, recommended.body);
  assert.equal(recommended.json().recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-b'), true);
});

test('teacher availability self-service is scoped to own teacher actor', async () => {
  const adminAuth = await signIn('school_admin');
  const teacherAuth = await signIn('teacher');
  const { periodId } = await seedLeaveNeedingCoverage(adminAuth);

  const own = await app.inject({
    method: 'PATCH',
    url: '/api/roster/availability',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-demo',
      records: [{ date: '2026-05-04', timetablePeriodId: periodId, availabilityStatus: 'limited' }]
    }
  });
  assert.equal(own.statusCode, 200, own.body);

  const other = await app.inject({
    method: 'PATCH',
    url: '/api/roster/availability',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-sub-b',
      records: [{ date: '2026-05-04', timetablePeriodId: periodId, availabilityStatus: 'unavailable' }]
    }
  });
  assert.equal(other.statusCode, 400);
  assert.match(other.json().message, /own availability/);
});

test('teacher cannot request substitute recommendations', async () => {
  const adminAuth = await signIn('school_admin');
  const teacherAuth = await signIn('teacher');
  const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth);

  const response = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}`,
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /school admins/);
});

test('recommendation API validates missing or mismatched request data', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId } = await seedLeaveNeedingCoverage(adminAuth);

  const missing = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(missing.statusCode, 400);

  const missingJob = await app.inject({
    method: 'GET',
    url: '/api/roster/substitutes/recommendations/not-a-job',
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(missingJob.statusCode, 400);
});

test('admin creates substitute offer with notification, audit, and assigned coverage status', async () => {
  const notificationRepository = new InMemoryNotificationRepository();
  const assignmentRepository = new InMemorySubstituteAssignmentRepository();
  const localApp = buildRosterApiApp({
    ...(await createDefaultRosterApiServices()),
    notificationRepository,
    substituteAssignmentRepository: assignmentRepository
  });
  await localApp.ready();
  try {
    const adminAuth = await signIn('school_admin', localApp);
    const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth, localApp);

    const offered = await localApp.inject({
      method: 'POST',
      url: '/api/roster/substitutes',
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { leaveId, sessionId, substituteTeacherId: 'teacher-sub-b' }
    });
    assert.equal(offered.statusCode, 201, offered.body);
    assert.equal(offered.json().assignment.status, 'offered');
    assert.equal(offered.json().assignment.substituteTeacherId, 'teacher-sub-b');
    assert.equal(offered.json().assignments.length, 1);

    const impacts = await localApp.inject({
      method: 'GET',
      url: `/api/roster/leave/${leaveId}/impacts`,
      headers: { cookie: adminAuth.cookie }
    });
    assert.equal(impacts.statusCode, 200, impacts.body);
    assert.equal(impacts.json().impacts[0].coverageStatus, 'assigned');
    const substituteNotification = [...notificationRepository.notifications.values()].find((item) => item.eventType === 'substitute.offered');
    assert.ok(substituteNotification);
    assert.equal(substituteNotification.recipientActorId, 'teacher-sub-b');
    assert.equal(assignmentRepository.auditEvents[0].action, 'substitute.offer.created');

    const teacherAuth = await signIn('teacher', localApp);
    const denied = await localApp.inject({
      method: 'POST',
      url: '/api/roster/substitutes',
      headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
      payload: { leaveId, sessionId, substituteTeacherId: 'teacher-sub-c' }
    });
    assert.equal(denied.statusCode, 400, denied.body);
    assert.match(denied.json().message, /Only school admins/);
  } finally {
    await localApp.close();
  }
});

test('substitute teacher lists own offers and can accept or decline only their assignment', async () => {
  const notificationRepository = new InMemoryNotificationRepository();
  const assignmentRepository = new InMemorySubstituteAssignmentRepository();
  const localApp = buildRosterApiApp({
    ...(await createDefaultRosterApiServices()),
    notificationRepository,
    substituteAssignmentRepository: assignmentRepository
  });
  await localApp.ready();
  try {
    const adminAuth = await signIn('school_admin', localApp);
    const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth, localApp);
    const offered = await localApp.inject({
      method: 'POST',
      url: '/api/roster/substitutes',
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { leaveId, sessionId, substituteTeacherId: 'teacher-sub-b' }
    });
    assert.equal(offered.statusCode, 201, offered.body);
    const assignmentId = offered.json().assignment.id as string;

    const subAuth = await signIn('teacher', localApp, 'sub-b@schoolroster.test');
    const listed = await localApp.inject({
      method: 'GET',
      url: '/api/roster/substitutes?schoolId=school-steck-demo',
      headers: { cookie: subAuth.cookie }
    });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.json().assignments.length, 1);
    assert.equal(listed.json().assignments[0].id, assignmentId);

    const accepted = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${assignmentId}/status`,
      headers: { cookie: subAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: subAuth.csrfToken },
      payload: { status: 'accepted' }
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(accepted.json().assignment.status, 'accepted');
    assert.ok(accepted.json().assignment.acceptedAt);
    let impacts = await localApp.inject({
      method: 'GET',
      url: `/api/roster/leave/${leaveId}/impacts`,
      headers: { cookie: adminAuth.cookie }
    });
    assert.equal(impacts.json().impacts[0].coverageStatus, 'covered');

    const otherTeacherAuth = await signIn('teacher', localApp);
    const denied = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${assignmentId}/status`,
      headers: { cookie: otherTeacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: otherTeacherAuth.csrfToken },
      payload: { status: 'declined' }
    });
    assert.equal(denied.statusCode, 400, denied.body);
    assert.match(denied.json().message, /own substitute offers/);

  } finally {
    await localApp.close();
  }
});

test('substitute teacher can decline an offered assignment and return coverage to unfilled', async () => {
  const localApp = buildRosterApiApp(await createDefaultRosterApiServices());
  await localApp.ready();
  try {
    const adminAuth = await signIn('school_admin', localApp);
    const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth, localApp);
    const offered = await localApp.inject({
      method: 'POST',
      url: '/api/roster/substitutes',
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { leaveId, sessionId, substituteTeacherId: 'teacher-sub-b' }
    });
    assert.equal(offered.statusCode, 201, offered.body);
    const subAuth = await signIn('teacher', localApp, 'sub-b@schoolroster.test');
    const declined = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${offered.json().assignment.id}/status`,
      headers: { cookie: subAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: subAuth.csrfToken },
      payload: { status: 'declined' }
    });
    assert.equal(declined.statusCode, 200, declined.body);
    assert.equal(declined.json().assignment.status, 'declined');
    const impacts = await localApp.inject({
      method: 'GET',
      url: `/api/roster/leave/${leaveId}/impacts`,
      headers: { cookie: adminAuth.cookie }
    });
    assert.equal(impacts.json().impacts[0].coverageStatus, 'unfilled');
  } finally {
    await localApp.close();
  }
});

test('admin cancels, completes, and reassigns substitute assignments with audit and notifications', async () => {
  const notificationRepository = new InMemoryNotificationRepository();
  const assignmentRepository = new InMemorySubstituteAssignmentRepository();
  const localApp = buildRosterApiApp({
    ...(await createDefaultRosterApiServices()),
    notificationRepository,
    substituteAssignmentRepository: assignmentRepository
  });
  await localApp.ready();
  try {
    const adminAuth = await signIn('school_admin', localApp);
    const first = await seedLeaveNeedingCoverage(adminAuth, localApp);
    const offered = await localApp.inject({
      method: 'POST',
      url: '/api/roster/substitutes',
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { leaveId: first.leaveId, sessionId: first.sessionId, substituteTeacherId: 'teacher-sub-b' }
    });
    assert.equal(offered.statusCode, 201, offered.body);
    const assignmentId = offered.json().assignment.id as string;

    const canceled = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${assignmentId}/status`,
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { status: 'canceled', cancellationReason: 'Teacher became unavailable.' }
    });
    assert.equal(canceled.statusCode, 200, canceled.body);
    assert.equal(canceled.json().assignment.status, 'canceled');
    assert.ok(canceled.json().assignment.canceledAt);
    let impacts = await localApp.inject({
      method: 'GET',
      url: `/api/roster/leave/${first.leaveId}/impacts`,
      headers: { cookie: adminAuth.cookie }
    });
    assert.equal(impacts.json().impacts[0].coverageStatus, 'unfilled');

    const reassigned = await localApp.inject({
      method: 'POST',
      url: `/api/roster/substitutes/${assignmentId}/reassign`,
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { substituteTeacherId: 'teacher-sub-b', cancellationReason: 'Balancing workload.' }
    });
    assert.equal(reassigned.statusCode, 200, reassigned.body);
    assert.equal(reassigned.json().previousAssignment.status, 'canceled');
    assert.equal(reassigned.json().assignment.status, 'offered');
    assert.equal(reassigned.json().assignment.substituteTeacherId, 'teacher-sub-b');
    impacts = await localApp.inject({
      method: 'GET',
      url: `/api/roster/leave/${first.leaveId}/impacts`,
      headers: { cookie: adminAuth.cookie }
    });
    assert.equal(impacts.json().impacts[0].coverageStatus, 'assigned');

    const subAuth = await signIn('teacher', localApp, 'sub-b@schoolroster.test');
    const accepted = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${reassigned.json().assignment.id}/status`,
      headers: { cookie: subAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: subAuth.csrfToken },
      payload: { status: 'accepted' }
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    const completed = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${reassigned.json().assignment.id}/status`,
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { status: 'completed' }
    });
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal(completed.json().assignment.status, 'completed');
    assert.ok(completed.json().assignment.completedAt);

    assert.ok([...notificationRepository.notifications.values()].some((item) => item.eventType === 'substitute.canceled'));
    assert.ok([...notificationRepository.notifications.values()].some((item) => item.eventType === 'substitute.completed'));
    assert.ok(assignmentRepository.auditEvents.some((item) => item.action === 'substitute.assignment.canceled'));
    assert.ok(assignmentRepository.auditEvents.some((item) => item.action === 'substitute.assignment.completed'));
    assert.ok(assignmentRepository.auditEvents.some((item) => item.action === 'substitute.assignment.reassigned'));
  } finally {
    await localApp.close();
  }
});

test('admin lifecycle blocks invalid substitute assignment transitions', async () => {
  const localApp = buildRosterApiApp(await createDefaultRosterApiServices());
  await localApp.ready();
  try {
    const adminAuth = await signIn('school_admin', localApp);
    const { leaveId, sessionId } = await seedLeaveNeedingCoverage(adminAuth, localApp);
    const offered = await localApp.inject({
      method: 'POST',
      url: '/api/roster/substitutes',
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { leaveId, sessionId, substituteTeacherId: 'teacher-sub-b' }
    });
    assert.equal(offered.statusCode, 201, offered.body);
    const assignmentId = offered.json().assignment.id as string;

    const cancelWithoutReason = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${assignmentId}/status`,
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { status: 'canceled' }
    });
    assert.equal(cancelWithoutReason.statusCode, 400, cancelWithoutReason.body);
    assert.match(cancelWithoutReason.json().message, /Cancellation reason is required/);

    const completeOffered = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${assignmentId}/status`,
      headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
      payload: { status: 'completed' }
    });
    assert.equal(completeOffered.statusCode, 400, completeOffered.body);
    assert.match(completeOffered.json().message, /Only accepted or assigned/);

    const teacherAuth = await signIn('teacher', localApp, 'sub-b@schoolroster.test');
    const teacherCancel = await localApp.inject({
      method: 'PATCH',
      url: `/api/roster/substitutes/${assignmentId}/status`,
      headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
      payload: { status: 'canceled', cancellationReason: 'No longer needed.' }
    });
    assert.equal(teacherCancel.statusCode, 400, teacherCancel.body);
    assert.match(teacherCancel.json().message, /Only school admins/);
  } finally {
    await localApp.close();
  }
});

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildRosterApiApp, createDefaultRosterApiServices } from '../../../src/rostering/api/app.js';
import { ROSTER_CSRF_HEADER_NAME } from '../../../src/rostering/auth/auth-service.js';

let app: FastifyInstance;
let seedCounter = 0;

type Auth = { cookie: string; csrfToken: string };

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

async function signIn(email: string, role: 'school_admin' | 'teacher'): Promise<Auth> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    payload: { email, password: 'Password123!', requestedRole: role }
  });
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: cookieHeaderFrom(response), csrfToken: response.json().session.csrfToken as string };
}

async function seedCoverageCase(adminAuth: Auth, label: string) {
  seedCounter += 1;
  const suffix = `${Date.now()}-${process.pid}-${seedCounter}-${label}`;
  const termId = `term-sub-e2e-${suffix}`;
  const timetable = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId, name: `Substitute E2E ${suffix}` }
  });
  assert.equal(timetable.statusCode, 201, timetable.body);
  const period = timetable.json().periods.find((item: { dayIndex: number; periodIndex: number }) => item.dayIndex === 1 && item.periodIndex === 1);
  assert.ok(period);

  const sessionId = `sub-e2e-session-${suffix}`;
  const session = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      id: sessionId,
      schoolId: 'school-steck-demo',
      termId,
      timetableId: timetable.json().timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: `room-sub-e2e-${label}`,
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
      termId,
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
  return {
    termId,
    leaveId: leave.json().leaveRequest.id as string,
    impactId: leave.json().impacts[0].id as string,
    sessionId
  };
}

test('substitute assignment convergence covers recommendation, offer, teacher response, queue, cancellation, reassignment, completion, audit, and notifications', async () => {
  const adminAuth = await signIn('admin@schoolroster.test', 'school_admin');
  const teacherAuth = await signIn('sub-b@schoolroster.test', 'teacher');
  const first = await seedCoverageCase(adminAuth, 'complete');

  const queuedRecommendation = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${first.leaveId}&session_id=${first.sessionId}&async=true`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(queuedRecommendation.statusCode, 200, queuedRecommendation.body);
  assert.equal(queuedRecommendation.json().status, 'running');

  const recommendationJob = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommendations/${queuedRecommendation.json().job_id}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(recommendationJob.statusCode, 200, recommendationJob.body);
  const recommendations = recommendationJob.json().job.result.recommendations as Array<{ teacher_id: string; breakdown: unknown }>;
  const selected = recommendations.find((item) => item.teacher_id === 'teacher-sub-b');
  assert.ok(selected);
  assert.ok(selected.breakdown);

  const offered = await app.inject({
    method: 'POST',
    url: '/api/roster/substitutes',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { leaveId: first.leaveId, sessionId: first.sessionId, substituteTeacherId: 'teacher-sub-b' }
  });
  assert.equal(offered.statusCode, 201, offered.body);
  const firstAssignmentId = offered.json().assignment.id as string;
  assert.equal(offered.json().assignment.status, 'offered');

  const listed = await app.inject({
    method: 'GET',
    url: '/api/roster/substitutes?schoolId=school-steck-demo',
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.ok(listed.json().assignments.some((item: { id: string }) => item.id === firstAssignmentId));

  const accepted = await app.inject({
    method: 'PATCH',
    url: `/api/roster/substitutes/${firstAssignmentId}/status`,
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: { status: 'accepted' }
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(accepted.json().assignment.status, 'accepted');

  let impacts = await app.inject({
    method: 'GET',
    url: `/api/roster/leave/${first.leaveId}/impacts`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(impacts.statusCode, 200, impacts.body);
  assert.equal(impacts.json().impacts[0].coverageStatus, 'covered');

  const completed = await app.inject({
    method: 'PATCH',
    url: `/api/roster/substitutes/${firstAssignmentId}/status`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { status: 'completed' }
  });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json().assignment.status, 'completed');

  const second = await seedCoverageCase(adminAuth, 'reassign');
  const secondOffer = await app.inject({
    method: 'POST',
    url: '/api/roster/substitutes',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { leaveId: second.leaveId, sessionId: second.sessionId, substituteTeacherId: 'teacher-sub-b' }
  });
  assert.equal(secondOffer.statusCode, 201, secondOffer.body);

  const declined = await app.inject({
    method: 'PATCH',
    url: `/api/roster/substitutes/${secondOffer.json().assignment.id}/status`,
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: { status: 'declined' }
  });
  assert.equal(declined.statusCode, 200, declined.body);
  assert.equal(declined.json().assignment.status, 'declined');

  let queue = await app.inject({
    method: 'GET',
    url: `/api/roster/coverage/unfilled?schoolId=school-steck-demo&termId=${second.termId}&teacherId=teacher-demo&date=2026-05-04`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(queue.statusCode, 200, queue.body);
  assert.deepEqual(queue.json().items.map((item: { impact: { id: string } }) => item.impact.id), [second.impactId]);

  const reassigned = await app.inject({
    method: 'POST',
    url: `/api/roster/substitutes/${secondOffer.json().assignment.id}/reassign`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { substituteTeacherId: 'teacher-sub-b', cancellationReason: 'Retry after confirming availability.' }
  });
  assert.equal(reassigned.statusCode, 200, reassigned.body);
  assert.equal(reassigned.json().previousAssignment.status, 'declined');
  assert.equal(reassigned.json().assignment.status, 'offered');
  assert.notEqual(reassigned.json().assignment.id, secondOffer.json().assignment.id);

  impacts = await app.inject({
    method: 'GET',
    url: `/api/roster/leave/${second.leaveId}/impacts`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(impacts.json().impacts[0].coverageStatus, 'assigned');

  const canceled = await app.inject({
    method: 'PATCH',
    url: `/api/roster/substitutes/${reassigned.json().assignment.id}/status`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { status: 'canceled', cancellationReason: 'Class moved to supervised study.' }
  });
  assert.equal(canceled.statusCode, 200, canceled.body);
  assert.equal(canceled.json().assignment.status, 'canceled');
  assert.equal(canceled.json().assignment.cancellationReason, 'Class moved to supervised study.');

  queue = await app.inject({
    method: 'GET',
    url: `/api/roster/coverage/unfilled?schoolId=school-steck-demo&termId=${second.termId}&teacherId=teacher-demo&date=2026-05-04`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(queue.statusCode, 200, queue.body);
  assert.deepEqual(queue.json().items.map((item: { impact: { id: string } }) => item.impact.id), [second.impactId]);

  const teacherQueueDenied = await app.inject({
    method: 'GET',
    url: `/api/roster/coverage/unfilled?schoolId=school-steck-demo&termId=${second.termId}`,
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(teacherQueueDenied.statusCode, 400, teacherQueueDenied.body);
  assert.match(teacherQueueDenied.json().message, /Only school admins/);
});

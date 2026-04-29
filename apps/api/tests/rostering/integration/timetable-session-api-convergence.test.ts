import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { ROSTER_CSRF_HEADER_NAME } from '../../../src/rostering/auth/auth-service.js';
import { buildRosterApiApp, createDefaultRosterApiServices } from '../../../src/rostering/api/app.js';

let app: FastifyInstance;
let adminAuth: { cookie: string; csrfToken: string };
let teacherAuth: { cookie: string; csrfToken: string };

before(async () => {
  app = buildRosterApiApp(await createDefaultRosterApiServices());
  await app.ready();
  adminAuth = await signIn('school_admin');
  teacherAuth = await signIn('teacher');
});

after(async () => {
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
  return {
    cookie: cookieHeaderFrom(response),
    csrfToken: response.json().session.csrfToken as string
  };
}

test('admin can create timetable, create sessions, publish, and read all projection types through API', async () => {
  const timetableResponse = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-convergence',
      name: 'Convergence Timetable'
    }
  });
  assert.equal(timetableResponse.statusCode, 201, timetableResponse.body);
  const timetableBody = timetableResponse.json();
  const [firstPeriod, secondPeriod] = timetableBody.periods;
  assert.ok(firstPeriod);
  assert.ok(secondPeriod);

  const firstSession = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-convergence',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: firstPeriod.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: ['projector-1']
    }
  });
  assert.equal(firstSession.statusCode, 201, firstSession.body);

  const secondSession = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-convergence',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: secondPeriod.id,
      subjectId: 'subject-english',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-102',
      assignedTeacherId: 'teacher-other',
      equipmentResourceIds: ['speaker-1']
    }
  });
  assert.equal(secondSession.statusCode, 201, secondSession.body);

  const published = await app.inject({
    method: 'POST',
    url: `/api/roster/timetables/${timetableBody.timetable.id}/publish`,
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken }
  });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal(published.json().timetable.status, 'published');

  for (const [projectionType, ownerId, expectedCount] of [
    ['class', 'p4:A', 2],
    ['teacher', 'teacher-demo', 1],
    ['room', 'room-101', 1],
    ['equipment', 'projector-1', 1]
  ] as const) {
    const projection = await app.inject({
      method: 'GET',
      url: `/api/roster/schedule-projections?schoolId=school-steck-demo&termId=term-convergence&projectionType=${projectionType}&ownerId=${ownerId}`,
      headers: { cookie: adminAuth.cookie }
    });
    assert.equal(projection.statusCode, 200, projection.body);
    assert.equal(projection.json().projection.sessions.length, expectedCount, `${projectionType} projection count`);
  }
});

test('convergence path preserves auth, CSRF, conflict, and tenant boundaries', async () => {
  const timetableResponse = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-security',
      name: 'Security Timetable'
    }
  });
  assert.equal(timetableResponse.statusCode, 201, timetableResponse.body);
  const timetableBody = timetableResponse.json();
  const period = timetableBody.periods[0];
  assert.ok(period);

  const noCookie = await app.inject({
    method: 'GET',
    url: '/api/roster/timetables?schoolId=school-steck-demo&termId=term-security'
  });
  assert.equal(noCookie.statusCode, 401);

  const noCsrf = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-security',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-201',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });
  assert.equal(noCsrf.statusCode, 400);
  assert.match(noCsrf.json().message, /CSRF/);

  const created = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-security',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-201',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });
  assert.equal(created.statusCode, 201, created.body);

  const conflict = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-security',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'subject-science',
      gradeLevelId: 'p5',
      section: 'B',
      roomId: 'room-202',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().code, 'ROSTER_CONFLICT');

  const crossTenant = await app.inject({
    method: 'GET',
    url: '/api/roster/timetables?schoolId=school-other-demo&termId=term-security',
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(crossTenant.statusCode, 400);

  const teacherMutation = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-security',
      name: 'Teacher Cannot Create'
    }
  });
  assert.equal(teacherMutation.statusCode, 400);
});

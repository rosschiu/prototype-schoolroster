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
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.ok(cookies.includes('schoolroster_session='));
  return cookies;
}

async function signIn(role: 'school_admin' | 'teacher' = 'school_admin') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    payload: {
      email: role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test',
      password: 'Password123!',
      requestedRole: role
    }
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  return {
    cookie: cookieHeaderFrom(response),
    csrfToken: body.session.csrfToken as string,
    session: body.session
  };
}

async function createTimetable(auth: { cookie: string; csrfToken: string }) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      name: 'Main Timetable'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

test('timetable routes create, list, and publish with session and CSRF enforcement', async () => {
  const auth = await signIn();

  const missingCsrf = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: auth.cookie },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'No CSRF' }
  });
  assert.equal(missingCsrf.statusCode, 400);
  assert.match(missingCsrf.json().message, /CSRF/);

  const created = await createTimetable(auth);
  assert.equal(created.timetable.status, 'draft');
  assert.equal(created.periods.length, 40);

  const listed = await app.inject({
    method: 'GET',
    url: '/api/roster/timetables?schoolId=school-steck-demo&termId=term-2026-t1',
    headers: { cookie: auth.cookie }
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().timetables.length, 1);

  const published = await app.inject({
    method: 'POST',
    url: `/api/roster/timetables/${created.timetable.id}/publish`,
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken }
  });
  assert.equal(published.statusCode, 200);
  assert.equal(published.json().timetable.status, 'published');
});

test('CORS preflight permits browser PATCH and DELETE mutations', async () => {
  const response = await app.inject({
    method: 'OPTIONS',
    url: '/api/roster/leave/example/impacts',
    headers: {
      origin: 'http://127.0.0.1:5174',
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'content-type,x-schoolroster-csrf'
    }
  });

  assert.equal(response.statusCode, 204);
  assert.match(String(response.headers['access-control-allow-methods']), /PATCH/);
  assert.match(String(response.headers['access-control-allow-methods']), /DELETE/);
});

test('session routes create, update, delete, and return structured conflicts', async () => {
  const auth = await signIn();
  const createdTimetable = await createTimetable(auth);
  const periodId = createdTimetable.periods[0].id;
  const secondPeriodId = createdTimetable.periods[1].id;

  const createdSession = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: createdTimetable.timetable.id,
      timetablePeriodId: periodId,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: ['projector-1']
    }
  });
  assert.equal(createdSession.statusCode, 201, createdSession.body);

  const conflict = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: createdTimetable.timetable.id,
      timetablePeriodId: periodId,
      subjectId: 'subject-english',
      gradeLevelId: 'p5',
      section: 'B',
      roomId: 'room-102',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().code, 'ROSTER_CONFLICT');
  assert.match(conflict.json().message, /teacher_double_booked/);

  const sessionId = createdSession.json().session.id;
  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/roster/sessions/${sessionId}`,
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken },
    payload: { timetablePeriodId: secondPeriodId, notes: 'Moved' }
  });
  assert.equal(patched.statusCode, 200, patched.body);
  assert.equal(patched.json().session.timetablePeriodId, secondPeriodId);

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/roster/sessions/${sessionId}`,
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken }
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.json().ok, true);
});

test('timetable detail route returns sessions and publish/unpublish updates session exposure state', async () => {
  const auth = await signIn();
  const createdTimetable = await createTimetable(auth);
  const periodId = createdTimetable.periods[0].id;

  const createdSession = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: createdTimetable.timetable.id,
      timetablePeriodId: periodId,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: ['projector-1']
    }
  });
  assert.equal(createdSession.statusCode, 201, createdSession.body);

  const detail = await app.inject({
    method: 'GET',
    url: `/api/roster/timetables/${createdTimetable.timetable.id}`,
    headers: { cookie: auth.cookie }
  });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().periods.length, 40);
  assert.equal(detail.json().sessions.length, 1);
  assert.equal(detail.json().sessions[0].status, 'draft');

  const published = await app.inject({
    method: 'POST',
    url: `/api/roster/timetables/${createdTimetable.timetable.id}/publish`,
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken }
  });
  assert.equal(published.statusCode, 200, published.body);

  const afterPublish = await app.inject({
    method: 'GET',
    url: `/api/roster/timetables/${createdTimetable.timetable.id}`,
    headers: { cookie: auth.cookie }
  });
  assert.equal(afterPublish.json().sessions[0].status, 'published');

  const unpublished = await app.inject({
    method: 'POST',
    url: `/api/roster/timetables/${createdTimetable.timetable.id}/unpublish`,
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken }
  });
  assert.equal(unpublished.statusCode, 200, unpublished.body);
  assert.equal(unpublished.json().timetable.status, 'draft');

  const afterUnpublish = await app.inject({
    method: 'GET',
    url: `/api/roster/timetables/${createdTimetable.timetable.id}`,
    headers: { cookie: auth.cookie }
  });
  assert.equal(afterUnpublish.json().sessions[0].status, 'draft');
});

test('schedule projection route returns class and teacher projections with permission scope', async () => {
  const auth = await signIn();
  const teacherAuth = await signIn('teacher');
  const createdTimetable = await createTimetable(auth);
  const periodId = createdTimetable.periods[0].id;

  await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: createdTimetable.timetable.id,
      timetablePeriodId: periodId,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: ['projector-1']
    }
  });

  const classProjection = await app.inject({
    method: 'GET',
    url: '/api/roster/schedule-projections?schoolId=school-steck-demo&termId=term-2026-t1&projectionType=class&ownerId=p4:A',
    headers: { cookie: auth.cookie }
  });
  assert.equal(classProjection.statusCode, 200, classProjection.body);
  assert.equal(classProjection.json().projection.sessions.length, 1);

  const teacherProjection = await app.inject({
    method: 'GET',
    url: '/api/roster/schedule-projections?schoolId=school-steck-demo&termId=term-2026-t1&projectionType=teacher&ownerId=teacher-demo',
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(teacherProjection.statusCode, 200, teacherProjection.body);
  assert.equal(teacherProjection.json().projection.sessions.length, 1);

  const otherTeacherProjection = await app.inject({
    method: 'GET',
    url: '/api/roster/schedule-projections?schoolId=school-steck-demo&termId=term-2026-t1&projectionType=teacher&ownerId=teacher-other',
    headers: { cookie: teacherAuth.cookie }
  });
  assert.equal(otherTeacherProjection.statusCode, 400);
});

test('teacher cannot mutate timetable or sessions', async () => {
  const teacherAuth = await signIn('teacher');

  const create = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: teacherAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: teacherAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Teacher Attempt' }
  });

  assert.equal(create.statusCode, 400);
  assert.match(create.json().message, /Only school admins/);
});

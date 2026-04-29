import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { createPostgresDatabase } from '../../../src/db/postgres.js';
import { ROSTER_CSRF_HEADER_NAME } from '../../../src/rostering/auth/auth-service.js';
import { buildRosterApiApp, createDefaultRosterApiServices } from '../../../src/rostering/api/app.js';
import { migrateRosteringDatabase } from '../../../src/rostering/db/migrations.js';

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

test('admin queries roster audit events with object filters and teacher is denied', async () => {
  const admin = await signIn('school_admin');
  const created = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: admin.cookie, [ROSTER_CSRF_HEADER_NAME]: admin.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Audit API Timetable' }
  });
  assert.equal(created.statusCode, 201, created.body);
  const timetableId = created.json().timetable.id as string;
  const published = await app.inject({
    method: 'POST',
    url: `/api/roster/timetables/${timetableId}/publish`,
    headers: { cookie: admin.cookie, [ROSTER_CSRF_HEADER_NAME]: admin.csrfToken }
  });
  assert.equal(published.statusCode, 200, published.body);

  const all = await app.inject({
    method: 'GET',
    url: '/api/roster/audit?schoolId=school-steck-demo&limit=10',
    headers: { cookie: admin.cookie }
  });
  assert.equal(all.statusCode, 200, all.body);
  assert.ok(all.json().auditEvents.some((event: { eventType: string; objectId: string }) => event.eventType === 'timetable.publish' && event.objectId === timetableId));

  const filtered = await app.inject({
    method: 'GET',
    url: `/api/roster/audit?schoolId=school-steck-demo&objectType=timetable&objectId=${encodeURIComponent(timetableId)}`,
    headers: { cookie: admin.cookie }
  });
  assert.equal(filtered.statusCode, 200, filtered.body);
  assert.equal(filtered.json().auditEvents.length, 1);
  assert.equal(filtered.json().auditEvents[0].eventType, 'timetable.publish');
  assert.equal(filtered.json().auditEvents[0].metadata.after.id, timetableId);

  const teacher = await signIn('teacher');
  const denied = await app.inject({
    method: 'GET',
    url: '/api/roster/audit?schoolId=school-steck-demo',
    headers: { cookie: teacher.cookie }
  });
  assert.equal(denied.statusCode, 400);
  assert.match(denied.json().message, /school admins/);
});

test('PostgreSQL-backed audit route queries Steck-compatible audit_events when DATABASE_URL is available', async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip('DATABASE_URL is not set; PostgreSQL audit route is covered by pglocal validation.');
    return;
  }

  const schema = `rostering_audit_route_${randomUUID().replaceAll('-', '_')}`;
  const database = createPostgresDatabase(databaseUrl);
  let pgApp: FastifyInstance | undefined;
  try {
    await migrateRosteringDatabase(database, schema);
    pgApp = buildRosterApiApp(await createDefaultRosterApiServices({ database, schema }));
    await pgApp.ready();

    const response = await pgApp.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      payload: { email: 'admin@schoolroster.test', password: 'Password123!', requestedRole: 'school_admin' }
    });
    assert.equal(response.statusCode, 200, response.body);
    const auth = { cookie: cookieHeaderFrom(response), csrfToken: response.json().session.csrfToken as string };

    const created = await pgApp.inject({
      method: 'POST',
      url: '/api/roster/timetables',
      headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken },
      payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: `Audit PG ${schema}` }
    });
    assert.equal(created.statusCode, 201, created.body);
    const timetableId = created.json().timetable.id as string;

    const published = await pgApp.inject({
      method: 'POST',
      url: `/api/roster/timetables/${timetableId}/publish`,
      headers: { cookie: auth.cookie, [ROSTER_CSRF_HEADER_NAME]: auth.csrfToken }
    });
    assert.equal(published.statusCode, 200, published.body);

    const queried = await pgApp.inject({
      method: 'GET',
      url: `/api/roster/audit?schoolId=school-steck-demo&eventType=timetable.publish&objectId=${encodeURIComponent(timetableId)}`,
      headers: { cookie: auth.cookie }
    });
    assert.equal(queried.statusCode, 200, queried.body);
    assert.equal(queried.json().auditEvents.length, 1);
    assert.equal(queried.json().auditEvents[0].objectId, timetableId);
  } finally {
    if (pgApp) await pgApp.close();
    await database.query(`drop schema if exists "${schema}" cascade`).catch(() => undefined);
    await database.close();
  }
});

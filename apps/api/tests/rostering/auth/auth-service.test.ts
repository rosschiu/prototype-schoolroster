import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPostgresDatabase } from '../../../src/db/postgres.js';
import {
  AuthPermissionError,
  buildSessionCookies,
  createPostgresStandaloneAuthService,
  createStandaloneAuthService,
  hashPassword,
  isUnsafeMethod,
  parseCookies,
  seedPostgresStandaloneAuth,
  verifyPassword
} from '../../../src/rostering/auth/auth-service.js';
import { createStandaloneRosterAuthSeed } from '../../../src/rostering/auth/seed.js';
import { migrateRosteringDatabase } from '../../../src/rostering/db/migrations.js';

async function createService() {
  return createStandaloneAuthService({ seed: await createStandaloneRosterAuthSeed() });
}

test('password hashing uses scrypt and rejects wrong passwords', async () => {
  const hash = await hashPassword('Password123!');

  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword('Password123!', hash), true);
  assert.equal(await verifyPassword('WrongPassword123!', hash), false);
});

test('sign-in creates a school-scoped teacher session with CSRF companion token', async () => {
  const service = await createService();
  const created = await service.signIn({
    email: 'teacher@schoolroster.test',
    password: 'Password123!',
    requestedRole: 'teacher'
  });

  assert.ok(created);
  assert.equal(created.session.activeSchoolId, 'school-steck-demo');
  assert.equal(created.session.activeRole, 'teacher');
  assert.equal(created.session.actorByRole.teacher, 'teacher-demo');
  assert.ok(created.session.csrfToken);

  const session = await service.getSession({ sessionToken: created.sessionToken });
  assert.equal(session?.sessionId, created.session.sessionId);
  assert.equal(session?.activeSchoolId, 'school-steck-demo');
});

test('sign-in rejects suspended users and unavailable roles', async () => {
  const service = await createService();

  assert.equal(
    await service.signIn({
      email: 'suspended@schoolroster.test',
      password: 'Password123!',
      requestedRole: 'teacher'
    }),
    null
  );

  assert.equal(
    await service.signIn({
      email: 'teacher@schoolroster.test',
      password: 'Password123!',
      requestedRole: 'school_admin'
    }),
    null
  );
});

test('multi-role sessions switch active role only to available roles', async () => {
  const service = await createService();
  const created = await service.signIn({
    email: 'multirole@schoolroster.test',
    password: 'Password123!',
    requestedRole: 'teacher'
  });

  assert.ok(created);
  assert.equal(created.session.activeRole, 'teacher');

  const switched = await service.switchRole({ session: created.session, activeRole: 'school_admin' });
  assert.equal(switched?.activeRole, 'school_admin');

  const unavailable = await service.switchRole({ session: created.session, activeRole: 'support' });
  assert.equal(unavailable, null);
});

test('CSRF validation and cookie helpers follow secure cookie contract', async () => {
  const service = await createService();
  const created = await service.signIn({
    email: 'admin@schoolroster.test',
    password: 'Password123!',
    requestedRole: 'school_admin'
  });

  assert.ok(created);
  assert.equal(service.verifyCsrf(created.session, created.session.csrfToken), true);
  assert.equal(service.verifyCsrf(created.session, 'bad-token'), false);
  assert.equal(isUnsafeMethod('POST'), true);
  assert.equal(isUnsafeMethod('GET'), false);

  const cookies = buildSessionCookies({
    sessionToken: created.sessionToken,
    session: created.session,
    secure: true
  });
  assert.equal(cookies.length, 2);
  assert.ok(cookies[0]?.includes('HttpOnly'));
  assert.ok(cookies[0]?.includes('SameSite=Lax'));
  assert.ok(cookies[0]?.includes('Secure'));
  assert.ok(!cookies[1]?.includes('HttpOnly'));

  const parsed = parseCookies(cookies.map((cookie) => cookie.split(';')[0]).join('; '));
  assert.equal(typeof parsed.schoolroster_session, 'string');
  assert.equal(parsed.schoolroster_csrf, created.session.csrfToken);
});

test('role and school-scope guards deny unauthorized roster access', async () => {
  const service = await createService();
  const teacher = await service.signIn({
    email: 'teacher@schoolroster.test',
    password: 'Password123!',
    requestedRole: 'teacher'
  });
  const admin = await service.signIn({
    email: 'admin@schoolroster.test',
    password: 'Password123!',
    requestedRole: 'school_admin'
  });

  assert.ok(teacher);
  assert.ok(admin);
  assert.throws(() => service.requireRole(teacher.session, ['school_admin']), AuthPermissionError);
  assert.equal(service.requireRole(admin.session, ['school_admin']).activeRole, 'school_admin');
  assert.throws(() => service.assertSchoolScope(admin.session, 'school-other-demo'), AuthPermissionError);
  assert.doesNotThrow(() => service.assertSchoolScope(admin.session, 'school-steck-demo'));
});

test('sign-out revokes an existing session token', async () => {
  const service = await createService();
  const created = await service.signIn({
    email: 'teacher@schoolroster.test',
    password: 'Password123!',
    requestedRole: 'teacher'
  });

  assert.ok(created);
  await service.signOut(created.session.sessionId);
  assert.equal(await service.getSession({ sessionToken: created.sessionToken }), null);
});

test('PostgreSQL auth adapter persists sessions when DATABASE_URL is available', async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip('DATABASE_URL is not set; PostgreSQL auth adapter is covered by static typing and live-capable tests.');
    return;
  }

  const schema = `rostering_auth_test_${randomUUID().replaceAll('-', '_')}`;
  const database = createPostgresDatabase(databaseUrl);
  try {
    await migrateRosteringDatabase(database, schema);
    await seedPostgresStandaloneAuth({ database, schema, seed: await createStandaloneRosterAuthSeed() });

    const service = createPostgresStandaloneAuthService({ database, schema });
    const created = await service.signIn({
      email: 'teacher@schoolroster.test',
      password: 'Password123!',
      requestedRole: 'teacher',
      ipAddress: '127.0.0.1',
      userAgent: 'node-test'
    });

    assert.ok(created);
    assert.equal(created.session.actorByRole.teacher, 'teacher-demo');
    assert.equal(service.verifyCsrf(created.session, created.session.csrfToken), true);

    const session = await service.getSession({ sessionToken: created.sessionToken });
    assert.equal(session?.sessionId, created.session.sessionId);
    assert.equal(session?.activeSchoolId, 'school-steck-demo');

    const dbSessions = await database.query<{ count: string }>(
      `select count(*)::text as count from "${schema}"."auth_sessions" where id = $1`,
      [created.session.sessionId]
    );
    assert.equal(dbSessions.rows[0]?.count, '1');

    await service.signOut(created.session.sessionId);
    assert.equal(await service.getSession({ sessionToken: created.sessionToken }), null);
  } finally {
    await database.query(`drop schema if exists "${schema}" cascade`);
    await database.close();
  }
});

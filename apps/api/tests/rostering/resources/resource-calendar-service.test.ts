import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPostgresDatabase } from '../../../src/db/postgres.js';
import { createStandaloneAuthService, seedPostgresStandaloneAuth } from '../../../src/rostering/auth/auth-service.js';
import { createStandaloneRosterAuthSeed } from '../../../src/rostering/auth/seed.js';
import { InMemoryCalendarRepository, PostgresCalendarRepository, createCalendarService } from '../../../src/rostering/calendar/calendar-service.js';
import { migrateRosteringDatabase } from '../../../src/rostering/db/migrations.js';
import { seedPostgresRosteringReferenceData } from '../../../src/rostering/db/seed.js';
import { InMemoryResourceRepository, PostgresResourceRepository, ResourceValidationError, createResourceService } from '../../../src/rostering/resources/resource-service.js';

async function signedIn(role: 'school_admin' | 'teacher' = 'school_admin') {
  const auth = createStandaloneAuthService({ seed: await createStandaloneRosterAuthSeed() });
  const created = await auth.signIn({
    email: role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test',
    password: 'Password123!',
    requestedRole: role
  });
  assert.ok(created);
  return created.session;
}

test('admin manages local rooms and equipment without Steck dependency', async () => {
  const repository = new InMemoryResourceRepository();
  const service = createResourceService(repository);
  const session = await signedIn();

  const room = await service.createRoom({ session, schoolId: 'school-steck-demo', name: 'Room 101', roomCode: '101' });
  const projector = await service.createEquipmentResource({ session, schoolId: 'school-steck-demo', name: 'Projector A' });
  const resources = await service.listResources({ session, schoolId: 'school-steck-demo' });

  assert.equal(room.name, 'Room 101');
  assert.equal(projector.quantity, 1);
  assert.equal(resources.rooms.length, 1);
  assert.equal(resources.equipmentResources.length, 1);
});

test('teacher cannot manage resources and cross-school resource access is denied', async () => {
  const repository = new InMemoryResourceRepository();
  const service = createResourceService(repository);
  const teacher = await signedIn('teacher');
  const admin = await signedIn('school_admin');

  await assert.rejects(
    () => service.createRoom({ session: teacher, schoolId: 'school-steck-demo', name: 'Room 102' }),
    ResourceValidationError
  );
  await assert.rejects(
    () => service.listResources({ session: admin, schoolId: 'school-other-demo' }),
    ResourceValidationError
  );
});

test('admin manages calendar exceptions and no-school checks', async () => {
  const repository = new InMemoryCalendarRepository();
  const service = createCalendarService(repository);
  const session = await signedIn();

  await service.createException({
    session,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    exceptionDate: '2026-05-01',
    exceptionType: 'no_school',
    notes: 'Public holiday'
  });

  assert.equal(await service.isNoSchoolDate({ schoolId: 'school-steck-demo', termId: 'term-2026-t1', date: '2026-05-01' }), true);
  assert.equal(await service.isNoSchoolDate({ schoolId: 'school-steck-demo', termId: 'term-2026-t1', date: '2026-05-02' }), false);
});

test('PostgreSQL resource and calendar repositories persist rows when DATABASE_URL is available', async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip('DATABASE_URL is not set; PostgreSQL resource/calendar repositories are covered by live-capable tests.');
    return;
  }

  const schema = `rostering_resource_test_${randomUUID().replaceAll('-', '_')}`;
  const database = createPostgresDatabase(databaseUrl);
  try {
    await migrateRosteringDatabase(database, schema);
    const seed = await createStandaloneRosterAuthSeed();
    await seedPostgresStandaloneAuth({ database, schema, seed });
    await seedPostgresRosteringReferenceData({ database, schema });

    const session = await signedIn();
    const resourceService = createResourceService(new PostgresResourceRepository(database, schema));
    const calendarService = createCalendarService(new PostgresCalendarRepository(database, schema));

    await resourceService.createRoom({ session, schoolId: 'school-steck-demo', name: 'Lab 1', roomCode: 'LAB1' });
    await resourceService.createEquipmentResource({ session, schoolId: 'school-steck-demo', name: 'Tablet Cart', quantity: 2 });
    await calendarService.createException({
      session,
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      exceptionDate: '2026-05-04',
      exceptionType: 'no_school'
    });

    const reloadedResources = await createResourceService(new PostgresResourceRepository(database, schema))
      .listResources({ session, schoolId: 'school-steck-demo' });
    assert.ok(reloadedResources.rooms.some((room) => room.name === 'Lab 1'));
    assert.ok(reloadedResources.equipmentResources.some((resource) => resource.name === 'Tablet Cart'));
    assert.equal(
      await createCalendarService(new PostgresCalendarRepository(database, schema))
        .isNoSchoolDate({ schoolId: 'school-steck-demo', termId: 'term-2026-t1', date: '2026-05-04' }),
      true
    );
  } finally {
    await database.query(`drop schema if exists "${schema}" cascade`);
    await database.close();
  }
});

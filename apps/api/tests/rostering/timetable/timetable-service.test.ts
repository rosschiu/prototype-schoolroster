import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPostgresDatabase } from '../../../src/db/postgres.js';
import { createStandaloneAuthService } from '../../../src/rostering/auth/auth-service.js';
import { seedPostgresStandaloneAuth } from '../../../src/rostering/auth/auth-service.js';
import { createStandaloneRosterAuthSeed } from '../../../src/rostering/auth/seed.js';
import { migrateRosteringDatabase } from '../../../src/rostering/db/migrations.js';
import { seedPostgresRosteringReferenceData } from '../../../src/rostering/db/seed.js';
import {
  InMemoryTimetableRepository,
  PostgresTimetableRepository,
  TimetableConflictError,
  TimetableValidationError,
  createTimetableService
} from '../../../src/rostering/timetable/timetable-service.js';

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

test('admin creates timetable from sensible default template', async () => {
  const repository = new InMemoryTimetableRepository();
  const service = createTimetableService(repository);
  const session = await signedIn();

  const result = await service.createFromDefault({
    session,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      name: '2026 Term 1'
    }
  });

  assert.equal(result.timetable.status, 'draft');
  assert.equal(result.timetable.templateKey, 'hk-five-day-eight-periods');
  assert.equal(result.periods.length, 40);
  assert.equal(result.periods.filter((period) => period.halfDay === 'am').length, 20);
  assert.equal(result.periods.filter((period) => period.halfDay === 'pm').length, 20);
  assert.equal(result.periods.every((period) => period.isTeachingPeriod), true);
});

test('timetable service prevents duplicate school term names and cross-school mutation', async () => {
  const repository = new InMemoryTimetableRepository();
  const service = createTimetableService(repository);
  const session = await signedIn();

  await service.createFromDefault({
    session,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' }
  });

  await assert.rejects(
    () => service.createFromDefault({ session, request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' } }),
    TimetableConflictError
  );

  await assert.rejects(
    () => service.createFromDefault({ session, request: { schoolId: 'school-other-demo', termId: 'term-2026-t1', name: 'Other' } }),
    TimetableValidationError
  );
});

test('publish updates status and writes audit event', async () => {
  const repository = new InMemoryTimetableRepository();
  const service = createTimetableService(repository);
  const session = await signedIn();
  const { timetable } = await service.createFromDefault({
    session,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' }
  });

  await assert.rejects(() => service.publish({ session, timetableId: timetable.id }), /Confirm timetable structure/);
  await service.confirmStructure({ session, timetableId: timetable.id });
  const published = await service.publish({ session, timetableId: timetable.id });

  assert.equal(published.status, 'published');
  assert.equal(repository.auditEvents.at(-1)?.action, 'timetable.publish');
});

test('admin amends and confirms timetable periods before scheduling', async () => {
  const repository = new InMemoryTimetableRepository();
  const service = createTimetableService(repository);
  const session = await signedIn();
  const { timetable, periods } = await service.createFromDefault({
    session,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' }
  });

  const updated = await service.updatePeriods({
    session,
    timetableId: timetable.id,
    periods: periods.map((period) => period.id === periods[0]?.id ? { ...period, label: 'Assembly', isTeachingPeriod: false } : period)
  });
  assert.equal(updated.timetable.structureConfirmedAt, undefined);
  assert.equal(updated.periods[0]?.label, 'Assembly');
  assert.equal(updated.periods[0]?.isTeachingPeriod, false);

  const confirmed = await service.confirmStructure({ session, timetableId: timetable.id });
  assert.ok(confirmed.timetable.structureConfirmedAt);
  assert.equal(repository.auditEvents.at(-2)?.action, 'timetable.periods.updated');
  assert.equal(repository.auditEvents.at(-1)?.action, 'timetable.structure.confirmed');
});

test('timetable period update rejects overlaps and existing sessions', async () => {
  const repository = new InMemoryTimetableRepository();
  const service = createTimetableService(repository);
  const session = await signedIn();
  const { timetable, periods } = await service.createFromDefault({
    session,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' }
  });

  await assert.rejects(
    () => service.updatePeriods({
      session,
      timetableId: timetable.id,
      periods: periods.map((period) => period.id === periods[1]?.id ? { ...period, startTime: '09:00', endTime: '09:30' } : period)
    }),
    /overlap/
  );

  const period = periods[0];
  assert.ok(period);
  await service.createClassSession({
    session,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: []
    }
  });

  await assert.rejects(
    () => service.updatePeriods({ session, timetableId: timetable.id, periods }),
    /after class sessions exist/
  );
});

test('class session creation prevents teacher and room double booking', async () => {
  const repository = new InMemoryTimetableRepository();
  const service = createTimetableService(repository);
  const session = await signedIn();
  const { timetable, periods } = await service.createFromDefault({
    session,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' }
  });
  const period = periods[0];
  assert.ok(period);

  await service.createClassSession({
    session,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: ['projector-1']
    }
  });

  await assert.rejects(
    () => service.createClassSession({
      session,
      request: {
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: timetable.id,
        timetablePeriodId: period.id,
        subjectId: 'subject-english',
        gradeLevelId: 'p5',
        section: 'B',
        roomId: 'room-102',
        assignedTeacherId: 'teacher-demo',
        equipmentResourceIds: []
      }
    }),
    TimetableConflictError
  );

  await assert.rejects(
    () => service.createClassSession({
      session,
      request: {
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: timetable.id,
        timetablePeriodId: period.id,
        subjectId: 'subject-science',
        gradeLevelId: 'p6',
        section: 'C',
        roomId: 'room-101',
        assignedTeacherId: 'teacher-other',
        equipmentResourceIds: []
      }
    }),
    TimetableConflictError
  );
});

test('schedule projections are filtered by class, teacher, room, and equipment', async () => {
  const repository = new InMemoryTimetableRepository();
  const service = createTimetableService(repository);
  const adminSession = await signedIn();
  const { timetable, periods } = await service.createFromDefault({
    session: adminSession,
    request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Main' }
  });
  const period = periods[0];
  assert.ok(period);

  await service.createClassSession({
    session: adminSession,
    request: {
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: ['projector-1']
    }
  });

  const classProjection = await service.getProjection({
    session: adminSession,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    projectionType: 'class',
    ownerId: 'p4:A'
  });
  const roomProjection = await service.getProjection({
    session: adminSession,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    projectionType: 'room',
    ownerId: 'room-101'
  });
  const equipmentProjection = await service.getProjection({
    session: adminSession,
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    projectionType: 'equipment',
    ownerId: 'projector-1'
  });

  assert.equal(classProjection.sessions.length, 1);
  assert.equal(roomProjection.sessions.length, 1);
  assert.equal(equipmentProjection.sessions.length, 1);
});

test('PostgreSQL timetable repository persists schedules when DATABASE_URL is available', async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip('DATABASE_URL is not set; PostgreSQL timetable repository is covered by live-capable tests.');
    return;
  }

  const schema = `rostering_schedule_test_${randomUUID().replaceAll('-', '_')}`;
  const database = createPostgresDatabase(databaseUrl);
  try {
    await migrateRosteringDatabase(database, schema);
    const seed = await createStandaloneRosterAuthSeed();
    await seedPostgresStandaloneAuth({ database, schema, seed });
    await seedPostgresRosteringReferenceData({ database, schema });

    const session = await signedIn();
    const repository = new PostgresTimetableRepository(database, schema);
    const service = createTimetableService(repository);
    const { timetable, periods } = await service.createFromDefault({
      session,
      request: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'DB Main' }
    });
    const firstPeriod = periods[0];
    assert.ok(firstPeriod);

    const created = await service.createClassSession({
      session,
      request: {
        schoolId: 'school-steck-demo',
        termId: 'term-2026-t1',
        timetableId: timetable.id,
        timetablePeriodId: firstPeriod.id,
        subjectId: 'subject-math',
        gradeLevelId: 'p4',
        section: 'A',
        roomId: 'room-101',
        assignedTeacherId: 'teacher-demo',
        equipmentResourceIds: ['projector-1']
      }
    });
    await service.confirmStructure({ session, timetableId: timetable.id });
    await service.publish({ session, timetableId: timetable.id });

    const reloadedRepository = new PostgresTimetableRepository(database, schema);
    assert.equal((await reloadedRepository.listTimetables('school-steck-demo', 'term-2026-t1')).length, 1);
    assert.equal((await reloadedRepository.listPeriods(timetable.id)).length, 40);
    assert.deepEqual((await reloadedRepository.getClassSession(created.id))?.equipmentResourceIds, ['projector-1']);

    const projection = await createTimetableService(reloadedRepository).getProjection({
      session,
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      projectionType: 'teacher',
      ownerId: 'teacher-demo'
    });
    assert.equal(projection.sessions.length, 1);
  } finally {
    await database.query(`drop schema if exists "${schema}" cascade`);
    await database.close();
  }
});

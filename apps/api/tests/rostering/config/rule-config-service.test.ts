import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuleConfigService, InMemoryRuleConfigRepository } from '../../../src/rostering/config/rule-config-service.js';
import { InMemoryTimetableRepository } from '../../../src/rostering/timetable/timetable-service.js';
import type { AuthenticatedRosterSession } from '../../../src/rostering/auth/auth-service.js';

const adminSession: AuthenticatedRosterSession = {
  sessionId: 'session-admin',
  user: { userId: 'user-admin-demo', email: 'admin@schoolroster.test', displayName: 'Admin' },
  activeSchoolId: 'school-steck-demo',
  activeSchoolName: 'Demo School',
  activeRole: 'school_admin',
  availableRoles: ['school_admin'],
  actorByRole: { school_admin: 'admin-demo' },
  startedAt: '2026-04-28T00:00:00.000Z',
  lastSeenAt: '2026-04-28T00:00:00.000Z',
  expiresAt: '2026-04-29T00:00:00.000Z',
  csrfTokenHash: 'hash',
  csrfToken: 'csrf'
};

const teacherSession: AuthenticatedRosterSession = {
  ...adminSession,
  sessionId: 'session-teacher',
  user: { userId: 'user-teacher-demo', email: 'teacher@schoolroster.test', displayName: 'Teacher' },
  activeRole: 'teacher',
  availableRoles: ['teacher'],
  actorByRole: { teacher: 'teacher-demo' }
};

test('rule config service lists defaults and persists validated school weights', async () => {
  const repository = new InMemoryRuleConfigRepository();
  const timetableRepository = new InMemoryTimetableRepository();
  const service = createRuleConfigService({ repository, timetableRepository });

  const defaults = await service.list({ session: adminSession, schoolId: 'school-steck-demo' });
  assert.equal(defaults.find((rule) => rule.criteriaKey === 'workload_balance')?.weight, 0.3);

  await service.patch({
    session: adminSession,
    request: {
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

  const updated = await service.list({ session: adminSession, schoolId: 'school-steck-demo' });
  assert.equal(updated.find((rule) => rule.criteriaKey === 'workload_balance')?.weight, 1);
  assert.equal(updated.find((rule) => rule.criteriaKey === 'subject_competency')?.enabled, false);
  assert.deepEqual(await repository.listRuleWeights('school-steck-demo'), [
    { criteriaKey: 'workload_balance', weight: 1, enabled: true },
    { criteriaKey: 'subject_competency', weight: 0, enabled: false },
    { criteriaKey: 'class_familiarity', weight: 0, enabled: false },
    { criteriaKey: 'recency_penalty', weight: 0, enabled: false },
    { criteriaKey: 'preference_policy', weight: 0, enabled: false }
  ]);
});

test('rule config service rejects unsafe permissions and invalid weights', async () => {
  const service = createRuleConfigService({
    repository: new InMemoryRuleConfigRepository(),
    timetableRepository: new InMemoryTimetableRepository()
  });

  await assert.rejects(
    service.list({ session: teacherSession, schoolId: 'school-steck-demo' }),
    /Only school admins/
  );

  await assert.rejects(
    service.patch({
      session: adminSession,
      request: { schoolId: 'school-steck-demo', rules: [{ criteriaKey: 'workload_balance', weight: 1.5, enabled: true }] }
    }),
    /between 0 and 1/
  );

  await assert.rejects(
    service.patch({
      session: adminSession,
      request: {
        schoolId: 'school-steck-demo',
        rules: [
          { criteriaKey: 'workload_balance', weight: 0, enabled: false },
          { criteriaKey: 'subject_competency', weight: 0, enabled: false },
          { criteriaKey: 'class_familiarity', weight: 0, enabled: false },
          { criteriaKey: 'recency_penalty', weight: 0, enabled: false },
          { criteriaKey: 'preference_policy', weight: 0, enabled: false }
        ]
      }
    }),
    /At least one enabled/
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreferenceRuleService, InMemoryPreferenceRuleRepository } from '../../../src/rostering/rules/preference-rule-service.js';
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

test('preference rule service persists scoped preferred and hard exclusion rules', async () => {
  const service = createPreferenceRuleService({
    repository: new InMemoryPreferenceRuleRepository(),
    timetableRepository: new InMemoryTimetableRepository()
  });

  const saved = await service.patch({
    session: adminSession,
    request: {
      schoolId: 'school-steck-demo',
      rules: [
        {
          substituteTeacherId: 'teacher-sub-b',
          scope: 'subject_grade',
          preferenceType: 'preferred',
          subjectId: 'Math',
          gradeLevelId: 'P4',
          weight: 0.4,
          reason: 'Strong primary math cover'
        },
        {
          substituteTeacherId: 'teacher-sub-a',
          scope: 'school',
          preferenceType: 'hard_exclusion',
          reason: 'Not available for cover'
        }
      ]
    }
  });

  assert.equal(saved.length, 2);
  const listed = await service.list({ session: adminSession, schoolId: 'school-steck-demo' });
  assert.equal(listed.find((rule) => rule.preferenceType === 'preferred')?.weight, 0.4);
  assert.equal(listed.find((rule) => rule.preferenceType === 'hard_exclusion')?.substituteTeacherId, 'teacher-sub-a');
});

test('preference rule service validates scope fields and weights', async () => {
  const service = createPreferenceRuleService({
    repository: new InMemoryPreferenceRuleRepository(),
    timetableRepository: new InMemoryTimetableRepository()
  });

  await assert.rejects(
    service.patch({
      session: adminSession,
      request: {
        schoolId: 'school-steck-demo',
        rules: [{ substituteTeacherId: 'teacher-sub-b', scope: 'subject_grade', preferenceType: 'preferred', subjectId: 'Math' }]
      }
    }),
    /subjectId and gradeLevelId/
  );

  await assert.rejects(
    service.patch({
      session: adminSession,
      request: {
        schoolId: 'school-steck-demo',
        rules: [{ substituteTeacherId: 'teacher-sub-b', scope: 'school', preferenceType: 'soft_avoid', weight: 1.2 }]
      }
    }),
    /between 0 and 1/
  );
});


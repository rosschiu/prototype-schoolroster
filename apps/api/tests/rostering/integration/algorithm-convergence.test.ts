import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildRosterApiApp, createDefaultRosterApiServices } from '../../../src/rostering/api/app.js';
import { ROSTER_CSRF_HEADER_NAME } from '../../../src/rostering/auth/auth-service.js';
import { InMemoryAvailabilityRepository } from '../../../src/rostering/availability/availability-service.js';
import { InMemoryRuleConfigRepository } from '../../../src/rostering/config/rule-config-service.js';
import { InMemoryRecommendationJobRepository } from '../../../src/rostering/recommendation-jobs/recommendation-job-repository.js';
import { InMemoryPreferenceRuleRepository } from '../../../src/rostering/rules/preference-rule-service.js';
import { InMemorySubstituteRecommendationRepository } from '../../../src/rostering/substitute-matching/recommendation-service.js';

let app: FastifyInstance;

beforeEach(async () => {
  const ruleConfigRepository = new InMemoryRuleConfigRepository();
  const preferenceRuleRepository = new InMemoryPreferenceRuleRepository();
  const services = await createDefaultRosterApiServices();
  services.ruleConfigRepository = ruleConfigRepository;
  services.preferenceRuleRepository = preferenceRuleRepository;
  services.availabilityRepository = new InMemoryAvailabilityRepository();
  services.recommendationJobRepository = new InMemoryRecommendationJobRepository();
  services.substituteRecommendationRepository = new InMemorySubstituteRecommendationRepository(
    [
      { teacherId: 'teacher-demo', teacherName: 'Original Teacher' },
      { teacherId: 'teacher-sub-a', teacherName: 'Double Booked Teacher' },
      { teacherId: 'teacher-sub-b', teacherName: 'Preferred Math Specialist' },
      { teacherId: 'teacher-sub-c', teacherName: 'Unavailable Teacher' },
      { teacherId: 'teacher-multirole-demo', teacherName: 'Hard Excluded Teacher' },
      { teacherId: 'teacher-low', teacherName: 'Backup Teacher' }
    ],
    undefined,
    [
      { teacherId: 'teacher-sub-a', subjectId: 'Math', level: 'primary' },
      { teacherId: 'teacher-sub-b', subjectId: 'Math', level: 'primary' },
      { teacherId: 'teacher-sub-c', subjectId: 'Math', level: 'secondary' },
      { teacherId: 'teacher-multirole-demo', subjectId: 'Math', level: 'primary' },
      { teacherId: 'teacher-low', subjectId: 'Math', level: 'capable' }
    ],
    [
      { teacherId: 'teacher-sub-b', scheduleSessionId: 'algorithm-convergence-session', familiarityScore: 0.85 },
      { teacherId: 'teacher-low', scheduleSessionId: 'algorithm-convergence-session', familiarityScore: 0.1 }
    ],
    ruleConfigRepository,
    preferenceRuleRepository
  );
  app = buildRosterApiApp(services);
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

async function seedCoverageCase(adminAuth: { cookie: string; csrfToken: string }) {
  const timetable = await app.inject({
    method: 'POST',
    url: '/api/roster/timetables',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', name: 'Algorithm Convergence Timetable' }
  });
  assert.equal(timetable.statusCode, 201, timetable.body);
  const timetableBody = timetable.json();
  const period = timetableBody.periods.find((item: { dayIndex: number; periodIndex: number }) => item.dayIndex === 1 && item.periodIndex === 1);
  assert.ok(period);

  const session = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      id: 'algorithm-convergence-session',
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-algorithm-convergence',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: [],
      status: 'published'
    }
  });
  assert.equal(session.statusCode, 201, session.body);

  const doubleBooked = await app.inject({
    method: 'POST',
    url: '/api/roster/sessions',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      id: 'algorithm-convergence-double-booked',
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: timetableBody.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'Science',
      gradeLevelId: 'P5',
      section: 'B',
      roomId: 'room-algorithm-other',
      assignedTeacherId: 'teacher-sub-a',
      equipmentResourceIds: [],
      status: 'published'
    }
  });
  assert.equal(doubleBooked.statusCode, 201, doubleBooked.body);

  const leave = await app.inject({
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
  return { leaveId: leave.json().leaveRequest.id as string, sessionId: session.json().session.id as string, periodId: period.id as string };
}

test('algorithm convergence combines scoring, availability, preferences, hard filters, explainability, and job polling', async () => {
  const adminAuth = await signIn('school_admin');
  const { leaveId, sessionId, periodId } = await seedCoverageCase(adminAuth);

  const rules = await app.inject({
    method: 'PATCH',
    url: '/api/roster/rules',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      rules: [
        { criteriaKey: 'workload_balance', weight: 0.2, enabled: true },
        { criteriaKey: 'subject_competency', weight: 0.25, enabled: true },
        { criteriaKey: 'class_familiarity', weight: 0.2, enabled: true },
        { criteriaKey: 'recency_penalty', weight: 0.05, enabled: true },
        { criteriaKey: 'preference_policy', weight: 0.3, enabled: true },
        { criteriaKey: 'hard_constraints', weight: null, enabled: true, customParams: { require_competency: true } },
        { criteriaKey: 'weekly_substitute_cap', weight: null, enabled: true, customParams: { max_per_week: 5 } }
      ]
    }
  });
  assert.equal(rules.statusCode, 200, rules.body);

  const preferences = await app.inject({
    method: 'PATCH',
    url: '/api/roster/preferences',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      rules: [
        {
          id: 'algorithm-prefer-sub-b',
          substituteTeacherId: 'teacher-sub-b',
          scope: 'subject_grade',
          preferenceType: 'preferred',
          subjectId: 'Math',
          gradeLevelId: 'P4',
          weight: 0.4,
          reason: 'P4 Math continuity'
        },
        {
          id: 'algorithm-hard-exclude-multirole',
          substituteTeacherId: 'teacher-multirole-demo',
          scope: 'school',
          preferenceType: 'hard_exclusion',
          reason: 'Admin exclusion'
        }
      ]
    }
  });
  assert.equal(preferences.statusCode, 200, preferences.body);

  const availability = await app.inject({
    method: 'PATCH',
    url: '/api/roster/availability',
    headers: { cookie: adminAuth.cookie, [ROSTER_CSRF_HEADER_NAME]: adminAuth.csrfToken },
    payload: {
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-sub-c',
      records: [{ date: '2026-05-04', timetablePeriodId: periodId, availabilityStatus: 'unavailable', reason: 'Training' }]
    }
  });
  assert.equal(availability.statusCode, 200, availability.body);

  const queued = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}&async=true`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(queued.statusCode, 200, queued.body);
  assert.equal(queued.json().status, 'running');
  assert.equal(queued.json().current_step, 'scoring_candidates');

  const polled = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommendations/${queued.json().job_id}`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(polled.statusCode, 200, polled.body);
  const job = polled.json().job;
  assert.equal(job.status, 'completed');
  assert.equal(job.result.reason_codes.length, 0);

  const recommendations = job.result.recommendations;
  assert.ok(recommendations.length >= 1);
  assert.equal(recommendations[0].teacher_id, 'teacher-sub-b');
  assert.equal(recommendations[0].rank, 1);
  assert.equal(recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-demo'), false);
  assert.equal(recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-a'), false);
  assert.equal(recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-sub-c'), false);
  assert.equal(recommendations.some((item: { teacher_id: string }) => item.teacher_id === 'teacher-multirole-demo'), false);

  const top = recommendations[0];
  assert.equal(top.breakdown.workload_balance.weight, 0.2);
  assert.equal(top.breakdown.subject_competency.weight, 0.25);
  assert.equal(top.breakdown.class_familiarity.weight, 0.2);
  assert.equal(top.breakdown.recency_penalty.weight, 0.05);
  assert.equal(top.breakdown.preference_policy.weight, 0.3);
  assert.equal(top.breakdown.subject_competency.score, 1);
  assert.equal(top.breakdown.preference_policy.score, 0.9);
  assert.deepEqual(top.breakdown.preference_policy.rule_ids, ['algorithm-prefer-sub-b']);
  assert.equal(top.raw_inputs.competency_level, 'primary');
  assert.deepEqual(top.raw_inputs.preference_rule_ids, ['algorithm-prefer-sub-b']);
  assert.ok(top.breakdown.class_familiarity.score > 0);
  assert.ok(top.reason_codes.includes('PRIMARY_SUBJECT_MATCH'));

  const retry = await app.inject({
    method: 'GET',
    url: `/api/roster/substitutes/recommend?leave_id=${leaveId}&session_id=${sessionId}&async=true`,
    headers: { cookie: adminAuth.cookie }
  });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().job_id, queued.json().job_id);
  assert.equal(retry.json().status, 'completed');
  assert.equal(retry.json().recommendations[0].teacher_id, 'teacher-sub-b');
});

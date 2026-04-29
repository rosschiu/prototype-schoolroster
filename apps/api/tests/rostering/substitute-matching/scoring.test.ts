import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clamp01,
  expDecay,
  minMaxInvert,
  normalizeRuleWeights,
  rankSubstituteCandidates,
  saturatingCount,
  scoreClassFamiliarity,
  scorePreferencePolicy,
  scoreRecencyPenalty,
  scoreSubjectCompetency,
  scoreWorkloadBalance,
  SubstituteScoringConfigError,
  type CompositeCandidateInput,
  type RuleWeightConfig
} from '../../../src/rostering/substitute-matching/scoring.js';

const round4 = (value: number): number => Number(value.toFixed(4));

test('shared scoring helpers match the documented algorithm', () => {
  assert.equal(clamp01(Number.NaN), 0);
  assert.equal(clamp01(-0.1), 0);
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(0.45), 0.45);

  assert.equal(minMaxInvert(2, 2, 7), 1);
  assert.equal(minMaxInvert(4.5, 2, 7), 0.5);
  assert.equal(minMaxInvert(7, 2, 7), 0);
  assert.equal(minMaxInvert(3, 3, 3), 1);

  assert.equal(saturatingCount(0, 2), 0);
  assert.equal(saturatingCount(2, 2), 0.5);
  assert.equal(round4(expDecay(0, 3)), 1);
  assert.equal(round4(expDecay(3, 3)), 0.5);
  assert.equal(round4(expDecay(6, 3)), 0.25);
});

test('workload balance scorer prefers lower adjusted term and week load', () => {
  const scores = scoreWorkloadBalance([
    { teacherId: 'teacher-a', termSubUnits: 2, weekSubUnits: 0 },
    { teacherId: 'teacher-b', termSubUnits: 4, weekSubUnits: 1 },
    { teacherId: 'teacher-c', termSubUnits: 6, weekSubUnits: 2 }
  ]);

  assert.deepEqual(
    scores.map((score) => [score.teacherId, score.rawWorkload, score.score]),
    [
      ['teacher-a', 2, 1],
      ['teacher-b', 4.5, 0.5],
      ['teacher-c', 7, 0]
    ]
  );
  assert.ok(scores[0].score > scores[1].score);
  assert.ok(scores[1].score > scores[2].score);
});

test('workload balance scorer handles zero ties, high workload, and capacity', () => {
  assert.deepEqual(scoreWorkloadBalance([]), []);

  const tied = scoreWorkloadBalance([
    { teacherId: 'teacher-a', termSubUnits: 0, weekSubUnits: 0 },
    { teacherId: 'teacher-b', termSubUnits: 0, weekSubUnits: 0 }
  ]);
  assert.deepEqual(
    tied.map((score) => score.score),
    [1, 1]
  );

  const capacityAdjusted = scoreWorkloadBalance([
    { teacherId: 'teacher-a', termSubUnits: 8, weekSubUnits: 2, capacityFactor: 2 },
    { teacherId: 'teacher-b', termSubUnits: 8, weekSubUnits: 2, capacityFactor: 1 }
  ]);
  assert.deepEqual(
    capacityAdjusted.map((score) => [score.teacherId, score.rawWorkload, score.score]),
    [
      ['teacher-a', 4.5, 1],
      ['teacher-b', 9, 0]
    ]
  );
});

test('subject competency scorer maps all levels deterministically', () => {
  const levels = ['primary', 'secondary', 'capable', 'same_department', 'none'] as const;
  const scores = levels.map((level) => scoreSubjectCompetency({ competencyLevel: level }).score);

  assert.deepEqual(scores, [1, 0.75, 0.45, 0.3, 0]);
  assert.ok(scores[0] > scores[1]);
  assert.ok(scores[1] > scores[2]);
  assert.ok(scores[2] > scores[3]);
  assert.ok(scores[3] > scores[4]);
});

test('subject competency scorer matches documented credential and grade examples', () => {
  const teacherA = scoreSubjectCompetency({ competencyLevel: 'secondary', gradeMatch: 'same' });
  const teacherB = scoreSubjectCompetency({
    competencyLevel: 'primary',
    gradeMatch: 'same',
    credentialPreferred: true,
    credentialPresent: true
  });
  const teacherC = scoreSubjectCompetency({
    competencyLevel: 'capable',
    gradeMatch: 'adjacent',
    credentialPreferred: true,
    credentialPresent: false
  });

  assert.equal(teacherA.score, 0.75);
  assert.equal(teacherB.rawScore, 1.1);
  assert.equal(teacherB.score, 1);
  assert.equal(teacherC.rawScore, 0.1825);
  assert.equal(teacherC.score, 0.1825);
});

test('class familiarity scorer combines exact, section, subject-grade, recency, and manual scores', () => {
  const teacherA = scoreClassFamiliarity({
    exactCount: 0,
    sectionCount: 2,
    termsSinceLastSection: 1,
    subjectGradeCount: 1,
    termsSinceLastSubjectGrade: 1
  });
  const teacherB = scoreClassFamiliarity({});
  const teacherC = scoreClassFamiliarity({
    exactCount: 5,
    termsSinceLastExact: 0,
    sectionCount: 4,
    termsSinceLastSection: 0,
    subjectGradeCount: 3,
    termsSinceLastSubjectGrade: 0
  });
  const manualOverride = scoreClassFamiliarity({ manualFamiliarity: 0.9, exactCount: 1, termsSinceLastExact: 6 });

  assert.equal(round4(teacherA.exactSignal), 0);
  assert.equal(round4(teacherA.sectionSignal), 0.2381);
  assert.equal(round4(teacherA.subjectGradeSignal), 0.1191);
  assert.equal(round4(teacherA.score), 0.2381);
  assert.equal(teacherB.score, 0);
  assert.equal(round4(teacherC.exactSignal), 0.7143);
  assert.equal(round4(teacherC.sectionSignal), 0.4286);
  assert.equal(round4(teacherC.subjectGradeSignal), 0.3);
  assert.equal(round4(teacherC.score), 0.7143);
  assert.equal(manualOverride.score, 0.9);
});

const defaultRulesWithoutPreference: RuleWeightConfig[] = [
  { criteriaKey: 'workload_balance', weight: 0.3, enabled: true },
  { criteriaKey: 'subject_competency', weight: 0.35, enabled: true },
  { criteriaKey: 'class_familiarity', weight: 0.2, enabled: true },
  { criteriaKey: 'recency_penalty', weight: 0.15, enabled: true },
  { criteriaKey: 'preference_policy', weight: 0.1, enabled: false }
];

const defaultRulesWithPreference: RuleWeightConfig[] = [
  ...defaultRulesWithoutPreference.slice(0, 4),
  { criteriaKey: 'preference_policy', weight: 0.1, enabled: true }
];

function documentedCompositeCandidates(): CompositeCandidateInput[] {
  const workloads = scoreWorkloadBalance([
    { teacherId: 'teacher-a', termSubUnits: 2, weekSubUnits: 0 },
    { teacherId: 'teacher-b', termSubUnits: 4, weekSubUnits: 1 },
    { teacherId: 'teacher-c', termSubUnits: 6, weekSubUnits: 2 }
  ]);

  return [
    {
      teacherId: 'teacher-a',
      teacherName: 'Teacher A',
      workload: workloads[0],
      subjectCompetency: {
        ...scoreSubjectCompetency({ competencyLevel: 'secondary', gradeMatch: 'same' }),
        competencyLevel: 'secondary'
      },
      classFamiliarity: scoreClassFamiliarity({
        sectionCount: 2,
        termsSinceLastSection: 1,
        subjectGradeCount: 1,
        termsSinceLastSubjectGrade: 1
      }),
      recencyPenalty: { score: scoreRecencyPenalty({ daysSinceLastSub: null }), daysSinceLastSub: null },
      preferencePolicy: scorePreferencePolicy({}),
      reasonCodes: ['LOW_WORKLOAD']
    },
    {
      teacherId: 'teacher-b',
      teacherName: 'Teacher B',
      workload: workloads[1],
      subjectCompetency: {
        ...scoreSubjectCompetency({
          competencyLevel: 'primary',
          gradeMatch: 'same',
          credentialPreferred: true,
          credentialPresent: true
        }),
        competencyLevel: 'primary'
      },
      classFamiliarity: scoreClassFamiliarity({}),
      recencyPenalty: { score: scoreRecencyPenalty({ daysSinceLastSub: 7 }), daysSinceLastSub: 7 },
      preferencePolicy: scorePreferencePolicy({ preferredBoost: 0.3, ruleIds: ['pref-exact-b'] }),
      reasonCodes: ['PRIMARY_SUBJECT_MATCH']
    },
    {
      teacherId: 'teacher-c',
      teacherName: 'Teacher C',
      workload: workloads[2],
      subjectCompetency: {
        ...scoreSubjectCompetency({
          competencyLevel: 'capable',
          gradeMatch: 'adjacent',
          credentialPreferred: true,
          credentialPresent: false
        }),
        competencyLevel: 'capable'
      },
      classFamiliarity: scoreClassFamiliarity({
        exactCount: 5,
        termsSinceLastExact: 0,
        sectionCount: 4,
        termsSinceLastSection: 0,
        subjectGradeCount: 3,
        termsSinceLastSubjectGrade: 0
      }),
      recencyPenalty: { score: scoreRecencyPenalty({ daysSinceLastSub: 16 }), daysSinceLastSub: 16 },
      preferencePolicy: scorePreferencePolicy({ softPenalty: 0.3, ruleIds: ['avoid-c'] }),
      reasonCodes: ['CLASS_FAMILIAR']
    }
  ];
}

test('recency and preference scorers match documented examples', () => {
  assert.equal(scoreRecencyPenalty({ daysSinceLastSub: null }), 1);
  assert.equal(scoreRecencyPenalty({ daysSinceLastSub: 7 }), 0.5);
  assert.equal(scoreRecencyPenalty({ daysSinceLastSub: 16 }), 1);
  assert.equal(round4(scoreRecencyPenalty({ daysSinceLastSub: 7, shape: 'exponential' })), 0.7769);

  assert.equal(scorePreferencePolicy({}).score, 0.5);
  assert.deepEqual(scorePreferencePolicy({ preferredBoost: 0.3, ruleIds: ['r1'] }), {
    score: 0.8,
    hardExcluded: false,
    ruleIds: ['r1']
  });
  assert.deepEqual(scorePreferencePolicy({ softPenalty: 0.3, ruleIds: ['r2'] }), {
    score: 0.2,
    hardExcluded: false,
    ruleIds: ['r2']
  });
  assert.equal(scorePreferencePolicy({ hardExcluded: true }).hardExcluded, true);
});

test('composite ranking matches documented example when preference is disabled', () => {
  const recommendations = rankSubstituteCandidates({
    candidates: documentedCompositeCandidates(),
    ruleConfigs: defaultRulesWithoutPreference
  });

  assert.deepEqual(
    recommendations.map((recommendation) => [recommendation.teacher_id, round4(recommendation.composite_score), recommendation.rank]),
    [
      ['teacher-a', 0.7601, 1],
      ['teacher-b', 0.575, 2],
      ['teacher-c', 0.3567, 3]
    ]
  );
  assert.equal(round4(recommendations[0].breakdown.workload_balance.contribution), 0.3);
  assert.equal(round4(recommendations[0].breakdown.subject_competency.contribution), 0.2625);
  assert.equal(round4(recommendations[0].breakdown.class_familiarity.contribution), 0.0476);
  assert.equal(round4(recommendations[0].breakdown.recency_penalty.contribution), 0.15);
  assert.equal(recommendations[0].breakdown.preference_policy.weight, 0);
});

test('composite ranking normalizes weights when preference is enabled', () => {
  const recommendations = rankSubstituteCandidates({
    candidates: documentedCompositeCandidates(),
    ruleConfigs: defaultRulesWithPreference
  });

  assert.deepEqual(
    recommendations.map((recommendation) => [recommendation.teacher_id, round4(recommendation.composite_score), recommendation.rank]),
    [
      ['teacher-a', 0.7365, 1],
      ['teacher-b', 0.5955, 2],
      ['teacher-c', 0.3425, 3]
    ]
  );
  assert.equal(round4(recommendations[0].breakdown.workload_balance.weight), 0.2727);
  assert.equal(round4(recommendations[0].breakdown.preference_policy.weight), 0.0909);
  assert.deepEqual(recommendations[1].breakdown.preference_policy.rule_ids, ['pref-exact-b']);
});

test('composite scoring filters infeasible and hard-excluded candidates', () => {
  const candidates = documentedCompositeCandidates();
  candidates[1] = { ...candidates[1], feasible: false, infeasibleReasonCodes: ['UNAVAILABLE'] };
  candidates[2] = {
    ...candidates[2],
    preferencePolicy: scorePreferencePolicy({ hardExcluded: true, ruleIds: ['hard-exclude-c'] })
  };

  const recommendations = rankSubstituteCandidates({ candidates, ruleConfigs: defaultRulesWithPreference });
  assert.deepEqual(
    recommendations.map((recommendation) => recommendation.teacher_id),
    ['teacher-a']
  );
});

test('composite scoring validates weights and deterministic tie breakers', () => {
  assert.throws(
    () => normalizeRuleWeights([{ criteriaKey: 'workload_balance', weight: 0, enabled: true }]),
    SubstituteScoringConfigError
  );
  assert.throws(
    () => normalizeRuleWeights([{ criteriaKey: 'workload_balance', weight: -0.1, enabled: true }]),
    SubstituteScoringConfigError
  );

  const candidates = documentedCompositeCandidates();
  const tiedA: CompositeCandidateInput = {
    ...candidates[0],
    teacherId: 'teacher-z',
    workload: { ...candidates[0].workload, rawWorkload: 2, score: 0.5 },
    subjectCompetency: { ...candidates[0].subjectCompetency, score: 0.5 },
    classFamiliarity: { ...candidates[0].classFamiliarity, score: 0.5 }
  };
  const tiedB: CompositeCandidateInput = {
    ...tiedA,
    teacherId: 'teacher-a',
    teacherName: 'Teacher A',
    workload: { ...tiedA.workload, teacherId: 'teacher-a' }
  };
  const ranked = rankSubstituteCandidates({
    candidates: [tiedA, tiedB],
    ruleConfigs: [{ criteriaKey: 'workload_balance', weight: 1, enabled: true }]
  });

  assert.deepEqual(
    ranked.map((recommendation) => recommendation.teacher_id),
    ['teacher-a', 'teacher-z']
  );
});

test('composite scoring is fast enough for MVP scale fixtures', () => {
  const baseCandidates = documentedCompositeCandidates();
  const candidates = Array.from({ length: 100 }, (_, index) => ({
    ...baseCandidates[index % baseCandidates.length],
    teacherId: `teacher-${String(index).padStart(3, '0')}`,
    teacherName: `Teacher ${index}`
  }));
  const started = performance.now();
  const recommendations = rankSubstituteCandidates({ candidates, ruleConfigs: defaultRulesWithPreference });
  const elapsedMs = performance.now() - started;

  assert.equal(recommendations.length, 100);
  assert.ok(elapsedMs < 50, `expected 100-candidate ranking below 50ms, got ${elapsedMs}ms`);
});

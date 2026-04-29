export type WorkloadCandidateInput = {
  teacherId: string;
  termSubUnits: number;
  weekSubUnits: number;
  capacityFactor?: number;
};

export type WorkloadScore = {
  teacherId: string;
  termSubUnits: number;
  weekSubUnits: number;
  capacityFactor: number;
  adjustedTermLoad: number;
  adjustedWeekLoad: number;
  rawWorkload: number;
  score: number;
};

export type CompetencyLevel = 'primary' | 'secondary' | 'capable' | 'same_department' | 'none';
export type GradeMatch = 'same' | 'adjacent' | 'different_allowed' | 'restricted';

export type SubjectCompetencyInput = {
  competencyLevel?: CompetencyLevel | null;
  gradeMatch?: GradeMatch;
  credentialPreferred?: boolean;
  credentialPresent?: boolean;
  baseScores?: Partial<Record<CompetencyLevel, number>>;
  gradeMultipliers?: Partial<Record<Exclude<GradeMatch, 'restricted'>, number>>;
  credentialBonus?: number;
  missingPreferredCredentialPenalty?: number;
};

export type SubjectCompetencyScore = {
  baseSubjectScore: number;
  gradeMultiplier: number;
  credentialBonus: number;
  credentialPenalty: number;
  rawScore: number;
  score: number;
};

export type ClassFamiliarityInput = {
  manualFamiliarity?: number | null;
  exactCount?: number;
  termsSinceLastExact?: number | null;
  sectionCount?: number;
  termsSinceLastSection?: number | null;
  subjectGradeCount?: number;
  termsSinceLastSubjectGrade?: number | null;
  halfLifeTerms?: number;
};

export type ClassFamiliarityScore = {
  exactSignal: number;
  sectionSignal: number;
  subjectGradeSignal: number;
  derivedFamiliarity: number;
  manualFamiliarity: number;
  score: number;
};

export type RecencyPenaltyInput = {
  daysSinceLastSub?: number | null;
  windowDays?: number;
  shape?: 'linear' | 'exponential';
};

export type PreferencePolicyInput = {
  neutral?: number;
  preferredBoost?: number;
  softPenalty?: number;
  hardExcluded?: boolean;
  ruleIds?: string[];
};

export type CriterionKey =
  | 'workload_balance'
  | 'subject_competency'
  | 'class_familiarity'
  | 'recency_penalty'
  | 'preference_policy';

export type RuleWeightConfig = {
  criteriaKey: CriterionKey;
  weight?: number | null;
  enabled: boolean;
};

export type NormalizedCriterionWeight = {
  criteriaKey: CriterionKey;
  rawWeight: number;
  normalizedWeight: number;
};

export type CompositeCandidateInput = {
  teacherId: string;
  teacherName: string;
  feasible?: boolean;
  infeasibleReasonCodes?: string[];
  workload: WorkloadScore;
  subjectCompetency: SubjectCompetencyScore & { competencyLevel?: string | null };
  classFamiliarity: ClassFamiliarityScore;
  recencyPenalty: { score: number; daysSinceLastSub?: number | null };
  preferencePolicy?: { score: number; hardExcluded?: boolean; ruleIds?: string[] };
  reasonCodes?: string[];
};

type BreakdownKey =
  | 'workload_balance'
  | 'subject_competency'
  | 'class_familiarity'
  | 'recency_penalty'
  | 'preference_policy';

type CriterionBreakdown = {
  score: number;
  weight: number;
  contribution: number;
  detail: string;
  rule_ids?: string[];
};

export type SubstituteRecommendation = {
  teacher_id: string;
  teacher_name: string;
  composite_score: number;
  rank: number;
  is_feasible: true;
  breakdown: Record<BreakdownKey, CriterionBreakdown>;
  raw_inputs: {
    term_sub_units: number;
    week_sub_units: number;
    capacity_factor: number;
    raw_workload: number;
    competency_level: string | null;
    grade_multiplier: number;
    credential_bonus: number;
    credential_penalty: number;
    days_since_last_sub: number | null;
    familiarity_signals: Record<string, number>;
    preference_rule_ids: string[];
  };
  reason_codes: string[];
};

export class SubstituteScoringConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubstituteScoringConfigError';
  }
}

const DEFAULT_BASE_SUBJECT_SCORES: Record<CompetencyLevel, number> = {
  primary: 1,
  secondary: 0.75,
  capable: 0.45,
  same_department: 0.3,
  none: 0
};

const DEFAULT_GRADE_MULTIPLIERS: Record<Exclude<GradeMatch, 'restricted'>, number> = {
  same: 1,
  adjacent: 0.85,
  different_allowed: 0.7
};

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function minMaxInvert(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return 1;
  const position = (value - min) / range;
  return clamp01(1 - position);
}

export function saturatingCount(count: number, halfSaturationCount: number): number {
  if (count <= 0) return 0;
  return clamp01(count / (count + halfSaturationCount));
}

export function expDecay(termsAgo: number, halfLifeTerms: number): number {
  const lambda = Math.log(2) / halfLifeTerms;
  return Math.exp(-lambda * Math.max(0, termsAgo));
}

export function scoreWorkloadBalance(
  candidates: WorkloadCandidateInput[],
  options: { weekPressureWeight?: number } = {}
): WorkloadScore[] {
  const weekPressureWeight = options.weekPressureWeight ?? 0.5;
  const rawScores = candidates.map((candidate) => {
    const capacityFactor = candidate.capacityFactor && candidate.capacityFactor > 0 ? candidate.capacityFactor : 1;
    const termSubUnits = Math.max(0, candidate.termSubUnits);
    const weekSubUnits = Math.max(0, candidate.weekSubUnits);
    const adjustedTermLoad = termSubUnits / capacityFactor;
    const adjustedWeekLoad = weekSubUnits / capacityFactor;
    const rawWorkload = adjustedTermLoad + weekPressureWeight * adjustedWeekLoad;
    return {
      teacherId: candidate.teacherId,
      termSubUnits,
      weekSubUnits,
      capacityFactor,
      adjustedTermLoad,
      adjustedWeekLoad,
      rawWorkload
    };
  });
  const loads = rawScores.map((candidate) => candidate.rawWorkload);
  const minLoad = loads.length > 0 ? Math.min(...loads) : 0;
  const maxLoad = loads.length > 0 ? Math.max(...loads) : 0;

  return rawScores.map((candidate) => ({
    ...candidate,
    score: minMaxInvert(candidate.rawWorkload, minLoad, maxLoad)
  }));
}

export function scoreSubjectCompetency(input: SubjectCompetencyInput): SubjectCompetencyScore {
  const baseScores = { ...DEFAULT_BASE_SUBJECT_SCORES, ...input.baseScores };
  const gradeMultipliers = { ...DEFAULT_GRADE_MULTIPLIERS, ...input.gradeMultipliers };
  const competencyLevel = input.competencyLevel ?? 'none';
  const gradeMatch = input.gradeMatch ?? 'same';
  const baseSubjectScore = clamp01(baseScores[competencyLevel]);
  const gradeMultiplier = gradeMatch === 'restricted' ? 0 : clamp01(gradeMultipliers[gradeMatch]);
  const credentialBonus = input.credentialPreferred && input.credentialPresent ? (input.credentialBonus ?? 0.1) : 0;
  const credentialPenalty =
    input.credentialPreferred && !input.credentialPresent ? (input.missingPreferredCredentialPenalty ?? 0.2) : 0;
  const rawScore = baseSubjectScore * gradeMultiplier + credentialBonus - credentialPenalty;

  return {
    baseSubjectScore,
    gradeMultiplier,
    credentialBonus,
    credentialPenalty,
    rawScore,
    score: clamp01(rawScore)
  };
}

export function scoreClassFamiliarity(input: ClassFamiliarityInput): ClassFamiliarityScore {
  const halfLifeTerms = input.halfLifeTerms && input.halfLifeTerms > 0 ? input.halfLifeTerms : 3;
  const exactSignal =
    saturatingCount(input.exactCount ?? 0, 2) * expDecay(input.termsSinceLastExact ?? 0, halfLifeTerms);
  const sectionSignal =
    0.75 * saturatingCount(input.sectionCount ?? 0, 3) * expDecay(input.termsSinceLastSection ?? 0, halfLifeTerms);
  const subjectGradeSignal =
    0.6 *
    saturatingCount(input.subjectGradeCount ?? 0, 3) *
    expDecay(input.termsSinceLastSubjectGrade ?? 0, halfLifeTerms);
  const derivedFamiliarity = Math.max(exactSignal, sectionSignal, subjectGradeSignal);
  const manualFamiliarity = clamp01(input.manualFamiliarity ?? 0);

  return {
    exactSignal: clamp01(exactSignal),
    sectionSignal: clamp01(sectionSignal),
    subjectGradeSignal: clamp01(subjectGradeSignal),
    derivedFamiliarity: clamp01(derivedFamiliarity),
    manualFamiliarity,
    score: clamp01(Math.max(manualFamiliarity, derivedFamiliarity))
  };
}

export function scoreRecencyPenalty(input: RecencyPenaltyInput): number {
  const windowDays = input.windowDays && input.windowDays > 0 ? input.windowDays : 14;
  const daysSinceLastSub = input.daysSinceLastSub;
  if (daysSinceLastSub === null || daysSinceLastSub === undefined) return 1;
  if (daysSinceLastSub >= windowDays) return 1;
  if (input.shape === 'exponential') {
    const tau = windowDays / 3;
    return clamp01(1 - Math.exp(-Math.max(0, daysSinceLastSub) / tau));
  }
  return clamp01(Math.max(0, daysSinceLastSub) / windowDays);
}

export function scorePreferencePolicy(input: PreferencePolicyInput): { score: number; hardExcluded: boolean; ruleIds: string[] } {
  const hardExcluded = input.hardExcluded === true;
  return {
    hardExcluded,
      ruleIds: input.ruleIds ?? [],
    score: hardExcluded
      ? 0
      : clamp01((input.neutral ?? 0.5) + (input.preferredBoost ?? 0) - (input.softPenalty ?? 0))
  };
}

export function normalizeRuleWeights(configs: RuleWeightConfig[]): NormalizedCriterionWeight[] {
  const configured = configs.map((config) => ({
    criteriaKey: config.criteriaKey,
    rawWeight: config.enabled ? (config.weight ?? 0) : 0
  }));

  for (const config of configured) {
    if (config.rawWeight < 0 || config.rawWeight > 1) {
      throw new SubstituteScoringConfigError(`Invalid weight for ${config.criteriaKey}: ${config.rawWeight}`);
    }
  }

  const enabled = configured.filter((config) => config.rawWeight > 0);
  const weightSum = enabled.reduce((sum, config) => sum + config.rawWeight, 0);
  if (weightSum === 0) {
    throw new SubstituteScoringConfigError('At least one enabled substitute scoring criterion must have weight > 0');
  }

  return enabled.map((config) => ({
    ...config,
    normalizedWeight: config.rawWeight / weightSum
  }));
}

export function rankSubstituteCandidates(input: {
  candidates: CompositeCandidateInput[];
  ruleConfigs: RuleWeightConfig[];
  tieEpsilon?: number;
}): SubstituteRecommendation[] {
  const weights = normalizeRuleWeights(input.ruleConfigs);
  const weightByCriterion = new Map(weights.map((weight) => [weight.criteriaKey, weight.normalizedWeight]));
  const tieEpsilon = input.tieEpsilon ?? 0.001;

  const recommendations = input.candidates
    .filter((candidate) => candidate.feasible !== false)
    .filter((candidate) => candidate.preferencePolicy?.hardExcluded !== true)
    .map((candidate) => buildRecommendation(candidate, weightByCriterion));

  recommendations.sort((left, right) => {
    const scoreDelta = right.composite_score - left.composite_score;
    if (Math.abs(scoreDelta) > tieEpsilon) return scoreDelta;
    const workloadDelta = left.raw_inputs.raw_workload - right.raw_inputs.raw_workload;
    if (Math.abs(workloadDelta) > tieEpsilon) return workloadDelta;
    const competencyDelta = right.breakdown.subject_competency.score - left.breakdown.subject_competency.score;
    if (Math.abs(competencyDelta) > tieEpsilon) return competencyDelta;
    const familiarityDelta = right.breakdown.class_familiarity.score - left.breakdown.class_familiarity.score;
    if (Math.abs(familiarityDelta) > tieEpsilon) return familiarityDelta;
    return left.teacher_id.localeCompare(right.teacher_id);
  });

  return recommendations.map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1
  }));
}

function buildRecommendation(
  candidate: CompositeCandidateInput,
  weightByCriterion: Map<CriterionKey, number>
): SubstituteRecommendation {
  const preference = candidate.preferencePolicy ?? { score: 0.5, ruleIds: [] };
  const criteriaScores: Record<BreakdownKey, { score: number; detail: string; ruleIds?: string[] }> = {
    workload_balance: {
      score: candidate.workload.score,
      detail: `${candidate.workload.adjustedTermLoad} term units, ${candidate.workload.adjustedWeekLoad} this week`
    },
    subject_competency: {
      score: candidate.subjectCompetency.score,
      detail: `${candidate.subjectCompetency.competencyLevel ?? 'No'} subject competency`
    },
    class_familiarity: {
      score: candidate.classFamiliarity.score,
      detail: `exact ${candidate.classFamiliarity.exactSignal.toFixed(4)}, section ${candidate.classFamiliarity.sectionSignal.toFixed(4)}, subject-grade ${candidate.classFamiliarity.subjectGradeSignal.toFixed(4)}`
    },
    recency_penalty: {
      score: candidate.recencyPenalty.score,
      detail:
        candidate.recencyPenalty.daysSinceLastSub === null || candidate.recencyPenalty.daysSinceLastSub === undefined
          ? 'Never substituted'
          : `${candidate.recencyPenalty.daysSinceLastSub} days since last substitute assignment`
    },
    preference_policy: {
      score: preference.score,
      detail: preference.ruleIds?.length ? `${preference.ruleIds.length} matching preference rules` : 'No matching preference rules',
      ruleIds: preference.ruleIds ?? []
    }
  };

  const breakdown = Object.fromEntries(
    (Object.keys(criteriaScores) as BreakdownKey[]).map((key) => {
      const score = clamp01(criteriaScores[key].score);
      const weight = weightByCriterion.get(key) ?? 0;
      return [
        key,
        {
          score,
          weight,
          contribution: score * weight,
          detail: criteriaScores[key].detail,
          ...(criteriaScores[key].ruleIds ? { rule_ids: criteriaScores[key].ruleIds } : {})
        }
      ];
    })
  ) as Record<BreakdownKey, CriterionBreakdown>;
  const compositeScore = (Object.values(breakdown) as CriterionBreakdown[]).reduce(
    (sum, criterion) => sum + criterion.contribution,
    0
  );

  return {
    teacher_id: candidate.teacherId,
    teacher_name: candidate.teacherName,
    composite_score: compositeScore,
    rank: 0,
    is_feasible: true,
    breakdown,
    raw_inputs: {
      term_sub_units: candidate.workload.termSubUnits,
      week_sub_units: candidate.workload.weekSubUnits,
      capacity_factor: candidate.workload.capacityFactor,
      raw_workload: candidate.workload.rawWorkload,
      competency_level: candidate.subjectCompetency.competencyLevel ?? null,
      grade_multiplier: candidate.subjectCompetency.gradeMultiplier,
      credential_bonus: candidate.subjectCompetency.credentialBonus,
      credential_penalty: candidate.subjectCompetency.credentialPenalty,
      days_since_last_sub: candidate.recencyPenalty.daysSinceLastSub ?? null,
      familiarity_signals: {
        exact_signal: candidate.classFamiliarity.exactSignal,
        section_signal: candidate.classFamiliarity.sectionSignal,
        subject_grade_signal: candidate.classFamiliarity.subjectGradeSignal
      },
      preference_rule_ids: preference.ruleIds ?? []
    },
    reason_codes: candidate.reasonCodes ?? []
  };
}

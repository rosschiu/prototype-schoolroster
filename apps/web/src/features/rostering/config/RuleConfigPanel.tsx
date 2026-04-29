import { useMemo, useState } from 'react';
import type { SubstituteRuleConfig, SubstituteRuleCriteriaKey } from '../../../../../../packages/contracts/src/rostering.js';
import type { RuleConfigApi } from './ruleConfigApi.js';

type RuleConfigPanelProps = {
  api?: RuleConfigApi;
  schoolId?: string;
};

const schoolIdDefault = 'school-steck-demo';
const scoringKeys: SubstituteRuleCriteriaKey[] = ['workload_balance', 'subject_competency', 'class_familiarity', 'recency_penalty', 'preference_policy'];

const defaultRules: SubstituteRuleConfig[] = [
  { id: 'rule-workload', schoolId: schoolIdDefault, criteriaKey: 'workload_balance', weight: 0.3, enabled: true, customParams: { week_pressure_weight: 0.5 }, updatedAt: '2026-04-28T00:00:00.000Z' },
  { id: 'rule-subject', schoolId: schoolIdDefault, criteriaKey: 'subject_competency', weight: 0.35, enabled: true, customParams: {}, updatedAt: '2026-04-28T00:00:00.000Z' },
  { id: 'rule-familiarity', schoolId: schoolIdDefault, criteriaKey: 'class_familiarity', weight: 0.2, enabled: true, customParams: { decay_half_life_terms: 3 }, updatedAt: '2026-04-28T00:00:00.000Z' },
  { id: 'rule-recency', schoolId: schoolIdDefault, criteriaKey: 'recency_penalty', weight: 0.15, enabled: true, customParams: { window_days: 14 }, updatedAt: '2026-04-28T00:00:00.000Z' },
  { id: 'rule-preference', schoolId: schoolIdDefault, criteriaKey: 'preference_policy', weight: 0.1, enabled: false, customParams: { neutral: 0.5 }, updatedAt: '2026-04-28T00:00:00.000Z' },
  { id: 'rule-cap', schoolId: schoolIdDefault, criteriaKey: 'weekly_substitute_cap', weight: null, enabled: true, customParams: { max_per_week: 5 }, updatedAt: '2026-04-28T00:00:00.000Z' },
  { id: 'rule-hard', schoolId: schoolIdDefault, criteriaKey: 'hard_constraints', weight: null, enabled: true, customParams: { require_competency: false, require_availability: true }, updatedAt: '2026-04-28T00:00:00.000Z' }
];

function labelFor(key: SubstituteRuleCriteriaKey): string {
  return {
    workload_balance: 'Workload balance',
    subject_competency: 'Subject competency',
    class_familiarity: 'Class familiarity',
    recency_penalty: 'Recency penalty',
    preference_policy: 'Preference policy',
    weekly_substitute_cap: 'Weekly substitute cap',
    hard_constraints: 'Hard constraints',
    exclusion: 'Exclusions'
  }[key];
}

function normalizeWeight(value: number | null | undefined): string {
  return String(Math.round((value ?? 0) * 100));
}

function scoringWeightSum(rules: SubstituteRuleConfig[]): number {
  return rules
    .filter((rule) => scoringKeys.includes(rule.criteriaKey) && rule.enabled)
    .reduce((sum, rule) => sum + (rule.weight ?? 0), 0);
}

export function RuleConfigPanel({ api, schoolId = schoolIdDefault }: RuleConfigPanelProps) {
  const [rules, setRules] = useState<SubstituteRuleConfig[]>(defaultRules);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const scoringRules = rules.filter((rule) => scoringKeys.includes(rule.criteriaKey));
  const hardRules = rules.filter((rule) => !scoringKeys.includes(rule.criteriaKey));
  const enabledWeightSum = useMemo(() => scoringWeightSum(rules), [rules]);
  const canSave = enabledWeightSum > 0 && rules.every((rule) => rule.weight === null || rule.weight === undefined || (rule.weight >= 0 && rule.weight <= 1));

  function updateRule(criteriaKey: SubstituteRuleCriteriaKey, patch: Partial<SubstituteRuleConfig>) {
    setRules((current) => current.map((rule) => (rule.criteriaKey === criteriaKey ? { ...rule, ...patch } : rule)));
  }

  function updateCustomParam(criteriaKey: SubstituteRuleCriteriaKey, key: string, value: unknown) {
    setRules((current) =>
      current.map((rule) =>
        rule.criteriaKey === criteriaKey ? { ...rule, customParams: { ...rule.customParams, [key]: value } } : rule
      )
    );
  }

  async function loadRules() {
    if (!api) return;
    setBusy('Loading rules...');
    setError('');
    try {
      const loaded = await api.listRules({ schoolId });
      setRules(loaded.rules);
      setToast('Rules loaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rule loading failed.');
    } finally {
      setBusy('');
    }
  }

  async function saveRules() {
    setToast('');
    setError('');
    if (!canSave) {
      setError('Enable at least one scoring criterion with a weight above 0.');
      return;
    }
    setBusy('Saving rules...');
    try {
      const payload = rules.map((rule) => ({
        criteriaKey: rule.criteriaKey,
        weight: scoringKeys.includes(rule.criteriaKey) ? (rule.weight ?? 0) : null,
        enabled: rule.enabled,
        customParams: rule.customParams
      }));
      const saved = api ? await api.patchRules({ schoolId, rules: payload }) : { rules };
      setRules((current) => current.map((rule) => saved.rules.find((item) => item.criteriaKey === rule.criteriaKey) ?? rule));
      setToast('Rule configuration saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rule save failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="panel-card rule-config-panel" id="rules" aria-label="Rule configuration">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">Admin</p>
          <h2>Rule Configuration</h2>
        </div>
        <span className="status-chip">{Math.round(enabledWeightSum * 100)} raw weight</span>
      </div>
      {busy ? <div className="toast" role="status">{busy}</div> : null}
      {toast && !busy ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <div className="rule-config-grid">
        <div aria-label="Scoring rule weights" className="rule-list">
          {scoringRules.map((rule) => (
            <article key={rule.criteriaKey} className="rule-row">
              <label className="check-row slim">
                <input
                  aria-label={`Enable ${labelFor(rule.criteriaKey)}`}
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => updateRule(rule.criteriaKey, { enabled: event.target.checked })}
                />
                {labelFor(rule.criteriaKey)}
              </label>
              <label>
                Weight
                <input
                  aria-label={`${labelFor(rule.criteriaKey)} weight`}
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={normalizeWeight(rule.weight)}
                  onChange={(event) => updateRule(rule.criteriaKey, { weight: Number(event.target.value) / 100 })}
                />
              </label>
              <strong>{normalizeWeight(rule.weight)}%</strong>
            </article>
          ))}
        </div>

        <div aria-label="Hard rule controls" className="hard-rule-card">
          <div className="section-title-row compact">
            <h3>Hard Rules</h3>
            <span className="status-chip">{hardRules.filter((rule) => rule.enabled).length}</span>
          </div>
          <label className="check-row">
            <input
              aria-label="Require competency"
              type="checkbox"
              checked={Boolean(rules.find((rule) => rule.criteriaKey === 'hard_constraints')?.customParams.require_competency)}
              onChange={(event) => updateCustomParam('hard_constraints', 'require_competency', event.target.checked)}
            />
            Require competency
          </label>
          <label>
            Weekly cap
            <input
              aria-label="Weekly substitute cap"
              type="number"
              min="1"
              max="20"
              value={Number(rules.find((rule) => rule.criteriaKey === 'weekly_substitute_cap')?.customParams.max_per_week ?? 5)}
              onChange={(event) => updateCustomParam('weekly_substitute_cap', 'max_per_week', Number(event.target.value))}
            />
          </label>
          <div className="rule-actions">
            <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void saveRules()}>Save rules</button>
            <button className="secondary-button" type="button" disabled={Boolean(busy) || !api} onClick={() => void loadRules()}>Refresh</button>
          </div>
        </div>
      </div>
    </section>
  );
}


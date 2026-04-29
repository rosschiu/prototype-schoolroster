import { useState } from 'react';
import type {
  SubstitutePreferenceRule,
  SubstitutePreferenceRuleScope,
  SubstitutePreferenceRuleType
} from '../../../../../../packages/contracts/src/rostering.js';
import type { TeacherOption } from '../schedule/types.js';
import type { PreferenceRulesApi } from './preferenceRulesApi.js';

type PreferenceRulesPanelProps = {
  teachers: TeacherOption[];
  api?: PreferenceRulesApi;
  schoolId?: string;
};

const defaultSchoolId = 'school-steck-demo';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/^\w/, (char) => char.toUpperCase());
}

export function PreferenceRulesPanel({ teachers, api, schoolId = defaultSchoolId }: PreferenceRulesPanelProps) {
  const [substituteTeacherId, setSubstituteTeacherId] = useState(teachers[1]?.id ?? 'teacher-lam');
  const [scope, setScope] = useState<SubstitutePreferenceRuleScope>('school');
  const [preferenceType, setPreferenceType] = useState<SubstitutePreferenceRuleType>('preferred');
  const [weight, setWeight] = useState('0.30');
  const [subjectId, setSubjectId] = useState('Math');
  const [gradeLevelId, setGradeLevelId] = useState('P4');
  const [originalTeacherId, setOriginalTeacherId] = useState(teachers[0]?.id ?? 'teacher-demo');
  const [scheduleSessionId, setScheduleSessionId] = useState('');
  const [reason, setReason] = useState('');
  const [rules, setRules] = useState<SubstitutePreferenceRule[]>([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    if (!api) return;
    setBusy('Loading preference rules...');
    setError('');
    try {
      const loaded = await api.listPreferenceRules({ schoolId });
      setRules(loaded.rules);
      setToast('Preference rules loaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preference rule loading failed.');
    } finally {
      setBusy('');
    }
  }

  async function saveRule() {
    setBusy('Saving preference rule...');
    setError('');
    setToast('');
    try {
      const payload = {
        schoolId,
        rules: [{
          substituteTeacherId,
          scope,
          preferenceType,
          weight: preferenceType === 'hard_exclusion' ? null : Number(weight),
          scheduleSessionId: scope === 'schedule_session' ? scheduleSessionId : undefined,
          originalTeacherId: scope === 'original_teacher' ? originalTeacherId : undefined,
          subjectId: scope === 'subject' || scope === 'subject_grade' ? subjectId : undefined,
          gradeLevelId: scope === 'subject_grade' ? gradeLevelId : undefined,
          reason: reason.trim() || undefined,
          enabled: true
        }]
      };
      const saved = api ? await api.patchPreferenceRules(payload) : {
        rules: payload.rules.map((rule, index): SubstitutePreferenceRule => ({
          id: `preference-local-${rules.length + index + 1}`,
          schoolId,
          substituteTeacherId: rule.substituteTeacherId,
          scope: rule.scope,
          preferenceType: rule.preferenceType,
          weight: rule.weight,
          scheduleSessionId: rule.scheduleSessionId,
          originalTeacherId: rule.originalTeacherId,
          subjectId: rule.subjectId,
          gradeLevelId: rule.gradeLevelId,
          reason: rule.reason,
          enabled: true,
          updatedBy: 'user-admin-demo',
          updatedAt: new Date().toISOString()
        }))
      };
      setRules((current) => [...saved.rules, ...current.filter((rule) => !saved.rules.some((item) => item.id === rule.id))]);
      setToast('Preference rule saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preference rule save failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="panel-card preference-rules-panel" id="preferences" aria-label="Preference and exclusion rules">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">Admin</p>
          <h2>Preference Rules</h2>
        </div>
        <span className="status-chip">{rules.length} rules</span>
      </div>
      {busy ? <div className="toast" role="status">{busy}</div> : null}
      {toast && !busy ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      <div className="preference-rule-grid">
        <div className="preference-rule-form">
          <label>
            Substitute
            <select aria-label="Preference substitute" value={substituteTeacherId} onChange={(event) => setSubstituteTeacherId(event.target.value)}>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
          </label>
          <label>
            Rule type
            <select aria-label="Preference rule type" value={preferenceType} onChange={(event) => setPreferenceType(event.target.value as SubstitutePreferenceRuleType)}>
              <option value="preferred">Preferred</option>
              <option value="soft_avoid">Soft avoid</option>
              <option value="hard_exclusion">Hard exclusion</option>
            </select>
          </label>
          <label>
            Scope
            <select aria-label="Preference scope" value={scope} onChange={(event) => setScope(event.target.value as SubstitutePreferenceRuleScope)}>
              <option value="school">School-wide</option>
              <option value="teacher">Substitute teacher</option>
              <option value="subject">Subject</option>
              <option value="subject_grade">Subject + grade</option>
              <option value="original_teacher">Original teacher</option>
              <option value="schedule_session">Schedule session</option>
            </select>
          </label>
          {scope === 'schedule_session' ? <label>Schedule session<input aria-label="Preference schedule session" value={scheduleSessionId} onChange={(event) => setScheduleSessionId(event.target.value)} /></label> : null}
          {scope === 'original_teacher' ? (
            <label>Original teacher<select aria-label="Preference original teacher" value={originalTeacherId} onChange={(event) => setOriginalTeacherId(event.target.value)}>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
          ) : null}
          {scope === 'subject' || scope === 'subject_grade' ? <label>Subject<input aria-label="Preference subject" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} /></label> : null}
          {scope === 'subject_grade' ? <label>Grade<input aria-label="Preference grade" value={gradeLevelId} onChange={(event) => setGradeLevelId(event.target.value)} /></label> : null}
          <label>
            Weight
            <input aria-label="Preference weight" type="number" min="0" max="1" step="0.05" value={weight} disabled={preferenceType === 'hard_exclusion'} onChange={(event) => setWeight(event.target.value)} />
          </label>
          <label>
            Reason
            <textarea aria-label="Preference reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="rule-actions">
            <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void saveRule()}>Save preference</button>
            <button className="secondary-button" type="button" disabled={Boolean(busy) || !api} onClick={() => void refresh()}>Refresh</button>
          </div>
        </div>

        <div aria-label="Preference rule list" className="preference-rule-list">
          {rules.length ? rules.map((rule) => (
            <article key={rule.id} className="preference-rule-card">
              <strong>{label(rule.preferenceType)} · {label(rule.scope)}</strong>
              <span>{teachers.find((teacher) => teacher.id === rule.substituteTeacherId)?.name ?? rule.substituteTeacherId}</span>
              <small>{rule.subjectId ?? rule.originalTeacherId ?? rule.scheduleSessionId ?? 'All contexts'}{rule.gradeLevelId ? ` · ${rule.gradeLevelId}` : ''}</small>
            </article>
          )) : <p className="empty-note">No preference rules.</p>}
        </div>
      </div>
    </section>
  );
}


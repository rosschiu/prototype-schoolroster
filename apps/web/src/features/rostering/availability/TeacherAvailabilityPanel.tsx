import { useMemo, useState } from 'react';
import type {
  SubstituteAvailability,
  SubstituteAvailabilityStatus,
  TimetablePeriod
} from '../../../../../../packages/contracts/src/rostering.js';
import type { TeacherOption } from '../schedule/types.js';
import type { AvailabilityApi, AvailabilityPatchRecord } from './availabilityApi.js';

type AvailabilityScope = 'full_day' | 'am_half_day' | 'pm_half_day' | 'single_period';

type TeacherAvailabilityPanelProps = {
  teachers: TeacherOption[];
  periods: TimetablePeriod[];
  currentTeacherId?: string;
  schoolId?: string;
  api?: AvailabilityApi;
};

const defaultSchoolId = 'school-steck-demo';

function dayIndexForDate(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function statusLabel(status: SubstituteAvailabilityStatus): string {
  return {
    available: 'Available',
    unavailable: 'Unavailable',
    limited: 'Limited'
  }[status];
}

function scopeLabel(scope: AvailabilityScope): string {
  return {
    full_day: 'Full day',
    am_half_day: 'AM half day',
    pm_half_day: 'PM half day',
    single_period: 'Single period'
  }[scope];
}

function periodLabel(period?: TimetablePeriod): string {
  if (!period) return 'Whole day';
  return `D${period.dayIndex} ${period.label} · ${period.startTime}-${period.endTime}`;
}

function newLocalAvailability(input: {
  schoolId: string;
  teacherId: string;
  records: AvailabilityPatchRecord[];
  updatedBy: string;
}): SubstituteAvailability[] {
  const updatedAt = new Date().toISOString();
  return input.records.map((record, index) => ({
    id: `availability-${record.date}-${record.timetablePeriodId ?? 'whole'}-${index + 1}`,
    schoolId: input.schoolId,
    teacherId: input.teacherId,
    date: record.date,
    timetablePeriodId: record.timetablePeriodId,
    availabilityStatus: record.availabilityStatus,
    reason: record.reason,
    updatedBy: input.updatedBy,
    updatedAt
  }));
}

export function TeacherAvailabilityPanel({
  teachers,
  periods,
  currentTeacherId = 'teacher-demo',
  schoolId = defaultSchoolId,
  api
}: TeacherAvailabilityPanelProps) {
  const [date, setDate] = useState('2026-05-04');
  const [scope, setScope] = useState<AvailabilityScope>('full_day');
  const [periodId, setPeriodId] = useState('');
  const [status, setStatus] = useState<SubstituteAvailabilityStatus>('unavailable');
  const [reason, setReason] = useState('');
  const [records, setRecords] = useState<SubstituteAvailability[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const currentTeacher = teachers.find((teacher) => teacher.id === currentTeacherId);
  const periodsById = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);
  const periodsForDate = useMemo(() => {
    const dayIndex = dayIndexForDate(date);
    return periods.filter((period) => period.dayIndex === dayIndex);
  }, [date, periods]);
  const singlePeriodOptions = periodsForDate.length ? periodsForDate : periods;

  const matchingRecordCount = useMemo(() => {
    const generated = buildRecords();
    return generated.length;
  }, [date, periodId, periodsForDate, reason, scope, status]);

  function buildRecords(): AvailabilityPatchRecord[] {
    const cleanReason = reason.trim() || undefined;
    if (!date || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) return [];
    if (scope === 'full_day') {
      return [{ date, availabilityStatus: status, reason: cleanReason }];
    }
    if (scope === 'single_period') {
      const targetPeriodId = periodId || singlePeriodOptions[0]?.id;
      return targetPeriodId ? [{ date, timetablePeriodId: targetPeriodId, availabilityStatus: status, reason: cleanReason }] : [];
    }
    const halfDay = scope === 'am_half_day' ? 'am' : 'pm';
    return periodsForDate
      .filter((period) => period.halfDay === halfDay)
      .map((period) => ({ date, timetablePeriodId: period.id, availabilityStatus: status, reason: cleanReason }));
  }

  function mergeRecords(updated: SubstituteAvailability[]) {
    const key = (record: Pick<SubstituteAvailability, 'date' | 'timetablePeriodId'>) => `${record.date}:${record.timetablePeriodId ?? ''}`;
    const updatedKeys = new Set(updated.map(key));
    setRecords((current) => [...updated, ...current.filter((record) => !updatedKeys.has(key(record)))]);
  }

  async function saveAvailability() {
    setError('');
    setToast('');
    const patchRecords = buildRecords();
    if (!patchRecords.length) {
      setError('Choose a valid date and period scope.');
      return;
    }
    setBusy('Saving availability...');
    try {
      const saved = api
        ? (await api.patchAvailability({ schoolId, teacherId: currentTeacherId, records: patchRecords, role: 'teacher' })).availability
        : newLocalAvailability({ schoolId, teacherId: currentTeacherId, records: patchRecords, updatedBy: 'user-teacher-demo' });
      mergeRecords(saved);
      setToast('Availability saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Availability update failed.');
    } finally {
      setBusy('');
    }
  }

  async function refreshAvailability() {
    if (!api) return;
    setError('');
    setToast('');
    setBusy('Loading availability...');
    try {
      const loaded = await api.listAvailability({
        schoolId,
        teacherId: currentTeacherId,
        startDate: date,
        endDate: date,
        role: 'teacher'
      });
      setRecords(loaded.availability);
      setToast('Availability loaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Availability load failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="panel-card availability-panel" id="availability" aria-label="Teacher availability self-service">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">Teacher</p>
          <h2>My Availability</h2>
        </div>
        <span className="status-chip">{currentTeacher?.name ?? currentTeacherId}</span>
      </div>
      {busy ? <div className="toast" role="status">{busy}</div> : null}
      {toast && !busy ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <div className="availability-grid">
        <div className="availability-form">
          <div className="form-grid two-col">
            <label>
              Date
              <input aria-label="Availability date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              Status
              <select aria-label="Availability status" value={status} onChange={(event) => setStatus(event.target.value as SubstituteAvailabilityStatus)}>
                <option value="available">Available</option>
                <option value="limited">Limited</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label>
              Scope
              <select aria-label="Availability scope" value={scope} onChange={(event) => setScope(event.target.value as AvailabilityScope)}>
                <option value="full_day">Full day</option>
                <option value="am_half_day">AM half day</option>
                <option value="pm_half_day">PM half day</option>
                <option value="single_period">Single period</option>
              </select>
            </label>
            <label>
              Availability period
              <select aria-label="Availability period" value={periodId} onChange={(event) => setPeriodId(event.target.value)} disabled={scope !== 'single_period'}>
                <option value="">First period for date</option>
                {singlePeriodOptions.map((period) => (
                  <option key={period.id} value={period.id}>{periodLabel(period)}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Reason
            <textarea aria-label="Availability reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="availability-actions">
            <button className="primary-button" type="button" onClick={() => void saveAvailability()} disabled={Boolean(busy)}>
              Save availability
            </button>
            <button className="secondary-button" type="button" onClick={() => void refreshAvailability()} disabled={Boolean(busy) || !api}>
              Refresh
            </button>
          </div>
        </div>

        <div className="availability-preview" aria-label="Availability save preview">
          <div className="section-title-row compact">
            <h3>{scopeLabel(scope)}</h3>
            <span className="status-chip">{matchingRecordCount} records</span>
          </div>
          <p>{statusLabel(status)} on {date || 'no date selected'}</p>
          {scope !== 'full_day' && matchingRecordCount === 0 ? (
            <div className="inline-warning">Create or load timetable periods before saving a half-day or period-specific override.</div>
          ) : null}
        </div>
      </div>

      <div className="availability-list" aria-label="Availability overrides">
        <div className="section-title-row compact">
          <h3>Overrides</h3>
          <span className="status-chip">{records.length}</span>
        </div>
        {records.length ? (
          <ul className="status-table">
            {records.map((record) => {
              const period = record.timetablePeriodId ? periodsById.get(record.timetablePeriodId) : undefined;
              return (
                <li key={`${record.date}-${record.timetablePeriodId ?? 'whole'}`} className="status-row">
                  <div>
                    <strong>{record.date}</strong>
                    <span>{periodLabel(period)}</span>
                    {record.reason ? <small>{record.reason}</small> : null}
                  </div>
                  <span className={`status-dot availability-${record.availabilityStatus}`}>{statusLabel(record.availabilityStatus)}</span>
                  <small>{record.updatedAt.slice(0, 10)}</small>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-note">No availability overrides.</p>
        )}
      </div>
    </section>
  );
}

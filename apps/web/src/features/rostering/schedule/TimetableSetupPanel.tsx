import { useEffect, useMemo, useState } from 'react';
import type { Timetable, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function sortPeriods(periods: TimetablePeriod[]): TimetablePeriod[] {
  return [...periods].sort((left, right) => left.dayIndex - right.dayIndex || left.periodIndex - right.periodIndex);
}

function validatePeriods(periods: TimetablePeriod[]): string[] {
  const errors: string[] = [];
  if (periods.length === 0) errors.push('Create at least one period.');
  if (!periods.some((period) => period.isTeachingPeriod && period.halfDay === 'am')) errors.push('Keep at least one AM teaching period.');
  if (!periods.some((period) => period.isTeachingPeriod && period.halfDay === 'pm')) errors.push('Keep at least one PM teaching period.');

  const byDay = new Map<number, TimetablePeriod[]>();
  for (const period of periods) {
    if (!period.label.trim()) errors.push('Every period needs a label.');
    if (period.startTime >= period.endTime) errors.push(`${dayNames[period.dayIndex - 1] ?? `Day ${period.dayIndex}`} ${period.label} starts after it ends.`);
    byDay.set(period.dayIndex, [...(byDay.get(period.dayIndex) ?? []), period]);
  }
  for (const dayPeriods of byDay.values()) {
    const sorted = [...dayPeriods].sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index - 1].endTime > sorted[index].startTime) {
        errors.push(`${dayNames[sorted[index].dayIndex - 1] ?? `Day ${sorted[index].dayIndex}`} periods overlap.`);
      }
    }
  }
  return [...new Set(errors)];
}

export function TimetableSetupPanel({
  timetable,
  periods,
  onSave,
  onConfirm
}: {
  timetable: Timetable | null;
  periods: TimetablePeriod[];
  onSave: (periods: TimetablePeriod[]) => void;
  onConfirm: () => void;
}) {
  const [draftPeriods, setDraftPeriods] = useState<TimetablePeriod[]>(() => sortPeriods(periods));
  const errors = useMemo(() => validatePeriods(draftPeriods), [draftPeriods]);
  const hasChanges = JSON.stringify(sortPeriods(periods)) !== JSON.stringify(sortPeriods(draftPeriods));
  const isConfirmed = Boolean(timetable?.structureConfirmedAt);

  useEffect(() => {
    setDraftPeriods(sortPeriods(periods));
  }, [periods]);

  if (!timetable) return null;

  function patchPeriod(periodId: string, patch: Partial<TimetablePeriod>) {
    setDraftPeriods((current) => current.map((period) => (period.id === periodId ? { ...period, ...patch } : period)));
  }

  return (
    <section className="timetable-setup-panel" aria-label="Timetable setup">
      <div className="section-title-row compact">
        <div>
          <p className="section-kicker">Timetable setup</p>
          <h2>{isConfirmed ? 'Structure confirmed' : 'Confirm structure before scheduling'}</h2>
        </div>
        <span className={`status-dot ${isConfirmed ? 'status-approved' : 'status-pending'}`}>
          {isConfirmed ? 'Confirmed' : 'Needs confirmation'}
        </span>
      </div>

      {errors.length > 0 ? (
        <div className="inline-error" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}

      <div className="period-editor-table">
        {draftPeriods.map((period) => (
          <div className="period-editor-row" key={period.id}>
            <strong>{dayNames[period.dayIndex - 1] ?? `Day ${period.dayIndex}`}</strong>
            <label>
              <span>Label</span>
              <input
                aria-label={`${dayNames[period.dayIndex - 1] ?? `Day ${period.dayIndex}`} period ${period.periodIndex} label`}
                value={period.label}
                onChange={(event) => patchPeriod(period.id, { label: event.target.value })}
              />
            </label>
            <label>
              <span>Start</span>
              <input
                aria-label={`${period.label} start time`}
                type="time"
                value={period.startTime}
                onChange={(event) => patchPeriod(period.id, { startTime: event.target.value })}
              />
            </label>
            <label>
              <span>End</span>
              <input
                aria-label={`${period.label} end time`}
                type="time"
                value={period.endTime}
                onChange={(event) => patchPeriod(period.id, { endTime: event.target.value })}
              />
            </label>
            <label>
              <span>Group</span>
              <select
                aria-label={`${period.label} half day group`}
                value={period.halfDay}
                onChange={(event) => patchPeriod(period.id, { halfDay: event.target.value as TimetablePeriod['halfDay'] })}
              >
                <option value="am">AM</option>
                <option value="pm">PM</option>
              </select>
            </label>
            <label className="check-row slim">
              <input
                aria-label={`${period.label} teaching period`}
                type="checkbox"
                checked={period.isTeachingPeriod}
                onChange={(event) => patchPeriod(period.id, { isTeachingPeriod: event.target.checked })}
              />
              Teaching
            </label>
          </div>
        ))}
      </div>

      <div className="setup-actions">
        <button className="secondary-button" type="button" disabled={!hasChanges || errors.length > 0} onClick={() => onSave(draftPeriods)}>
          Save timetable structure
        </button>
        <button className="primary-button" type="button" disabled={hasChanges || errors.length > 0 || isConfirmed} onClick={onConfirm}>
          Confirm structure
        </button>
      </div>
    </section>
  );
}

import { useMemo, useState } from 'react';
import type { ClassSession, TimetablePeriod, UnfilledCoverageQueueItem } from '../../../../../../packages/contracts/src/rostering.js';
import type { RoomOption, TeacherOption } from '../schedule/types.js';
import type { CoverageApi } from './coverageApi.js';

export function UnfilledCoverageQueue({
  api,
  sessions,
  periods,
  teachers,
  rooms
}: {
  api?: CoverageApi;
  sessions: ClassSession[];
  periods: TimetablePeriod[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
}) {
  const [items, setItems] = useState<UnfilledCoverageQueueItem[]>([]);
  const [dateFilter, setDateFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const periodById = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers]);
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms]);

  async function refresh() {
    setError('');
    setBusy('Loading unfilled coverage...');
    try {
      if (api) {
        const result = await api.listUnfilled({
          schoolId: 'school-steck-demo',
          termId: 'term-2026-t1',
          teacherId: teacherFilter || undefined,
          date: dateFilter || undefined
        });
        setItems(result.items);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unfilled coverage failed to load.');
    } finally {
      setBusy('');
    }
  }

  async function markNoCoverage(item: UnfilledCoverageQueueItem) {
    setError('');
    setBusy('Resolving coverage gap...');
    try {
      await api?.markNoCoverageNeeded({
        leaveRequestId: item.leaveRequest.id,
        impactId: item.impact.id,
        adjustmentReason: 'Marked no coverage needed from unfilled coverage queue.'
      });
      setItems((current) => current.filter((entry) => entry.impact.id !== item.impact.id));
      setToast('Coverage gap resolved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coverage gap could not be resolved.');
    } finally {
      setBusy('');
    }
  }

  function sessionFor(item: UnfilledCoverageQueueItem): ClassSession | undefined {
    return item.classSession ?? sessions.find((session) => session.id === item.impact.classSessionId);
  }

  return (
    <section className="panel-card unfilled-coverage-panel" id="coverage" aria-label="Unfilled coverage queue">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">Admin</p>
          <h2>Unfilled Coverage</h2>
        </div>
        <span className="status-chip">{items.length} gaps</span>
      </div>
      <div className="coverage-filter-row">
        <label>
          Date
          <input aria-label="Coverage date filter" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
        </label>
        <label>
          Absent teacher
          <select aria-label="Coverage teacher filter" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
            <option value="">All teachers</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void refresh()}>Refresh coverage queue</button>
      </div>
      {busy ? <div className="toast inline" role="status">{busy}</div> : null}
      {toast && !busy ? <div className="toast inline" role="status">{toast}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {items.length ? (
        <div className="coverage-queue-list">
          {items.map((item) => {
            const session = sessionFor(item);
            const period = session ? periodById.get(session.timetablePeriodId) : undefined;
            return (
              <article key={item.impact.id} className="coverage-queue-card">
                <div>
                  <strong>{item.impact.impactDate} · {session ? `${session.subjectId} · ${session.gradeLevelId}${session.section}` : item.impact.classSessionId}</strong>
                  <span>{period ? `Day ${period.dayIndex} ${period.label}` : 'Period pending'} · {session?.roomId ? roomById.get(session.roomId) ?? session.roomId : 'No room'}</span>
                  <small>Absent: {teacherById.get(item.leaveRequest.teacherId) ?? item.leaveRequest.teacherId} · {item.impact.coverageStatus}</small>
                </div>
                <div className="coverage-actions">
                  <a href="#leave">Open assignment flow</a>
                  <button type="button" onClick={() => setToast('Open the leave assignment panel to retry recommendations.')}>Retry recommendation</button>
                  <button type="button" onClick={() => void markNoCoverage(item)}>Mark no coverage needed</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-note">No unfilled coverage loaded.</p>
      )}
    </section>
  );
}

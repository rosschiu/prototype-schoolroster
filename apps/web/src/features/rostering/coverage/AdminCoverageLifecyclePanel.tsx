import { useMemo, useState } from 'react';
import type { ClassSession, SubstituteAssignment, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';
import type { RoomOption, TeacherOption } from '../schedule/types.js';
import type { CoverageLifecycleApi } from './coverageLifecycleApi.js';

export function AdminCoverageLifecyclePanel({
  api,
  sessions,
  periods,
  teachers,
  rooms
}: {
  api?: CoverageLifecycleApi;
  sessions: ClassSession[];
  periods: TimetablePeriod[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
}) {
  const [assignments, setAssignments] = useState<SubstituteAssignment[]>([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [reassignTeacherById, setReassignTeacherById] = useState<Record<string, string>>({});
  const periodById = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers]);
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms]);

  async function load() {
    setError('');
    setBusy('Loading coverage lifecycle...');
    try {
      const result = api ? await api.listAssignments({ schoolId: 'school-steck-demo' }) : { assignments: [] };
      setAssignments(result.assignments);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coverage lifecycle failed to load.');
    } finally {
      setBusy('');
    }
  }

  async function updateStatus(assignment: SubstituteAssignment, status: 'canceled' | 'completed') {
    setError('');
    setBusy(status === 'completed' ? 'Completing coverage...' : 'Canceling coverage...');
    try {
      const result = api
        ? await api.updateStatus({
          assignmentId: assignment.id,
          status,
          cancellationReason: status === 'canceled' ? 'Canceled from coverage lifecycle panel.' : undefined
        })
        : { assignment: { ...assignment, status } };
      setAssignments((current) => current.map((item) => (item.id === assignment.id ? result.assignment : item)));
      setToast(status === 'completed' ? 'Coverage marked completed.' : 'Coverage canceled.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coverage lifecycle update failed.');
    } finally {
      setBusy('');
    }
  }

  async function reassign(assignment: SubstituteAssignment) {
    const substituteTeacherId = reassignTeacherById[assignment.id];
    if (!substituteTeacherId) {
      setError('Choose a replacement teacher first.');
      return;
    }
    setError('');
    setBusy('Reassigning coverage...');
    try {
      const result = api
        ? await api.reassign({
          assignmentId: assignment.id,
          substituteTeacherId,
          cancellationReason: 'Reassigned from coverage lifecycle panel.'
        })
        : {
          previousAssignment: { ...assignment, status: 'canceled' as const },
          assignment: { ...assignment, id: `${assignment.id}-reassigned`, substituteTeacherId, status: 'offered' as const },
          assignments: []
        };
      setAssignments((current) => [
        result.assignment,
        ...current.map((item) => (item.id === result.previousAssignment.id ? result.previousAssignment : item))
      ]);
      setToast('Coverage reassigned.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coverage reassignment failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="panel-card coverage-lifecycle-panel" id="coverage-lifecycle" aria-label="Coverage lifecycle">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">Admin</p>
          <h2>Coverage Lifecycle</h2>
        </div>
        <button type="button" onClick={() => void load()}>Refresh lifecycle</button>
      </div>
      {busy ? <div className="toast inline" role="status">{busy}</div> : null}
      {toast && !busy ? <div className="toast inline" role="status">{toast}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {assignments.length ? (
        <div className="coverage-lifecycle-list">
          {assignments.map((assignment) => {
            const session = sessions.find((item) => item.id === assignment.classSessionId);
            const period = session ? periodById.get(session.timetablePeriodId) : undefined;
            const active = ['assigned', 'offered', 'acknowledged', 'accepted'].includes(assignment.status);
            return (
              <article key={assignment.id} className="coverage-lifecycle-card">
                <div>
                  <strong>{session ? `${session.subjectId} · ${session.gradeLevelId}${session.section}` : assignment.classSessionId}</strong>
                  <span>{period ? `Day ${period.dayIndex} ${period.label}` : 'Period pending'} · {session?.roomId ? roomById.get(session.roomId) ?? session.roomId : 'No room'}</span>
                  <small>
                    Original: {teacherById.get(assignment.originalTeacherId) ?? assignment.originalTeacherId}
                    {' · '}
                    Substitute: {teacherById.get(assignment.substituteTeacherId) ?? assignment.substituteTeacherId}
                  </small>
                </div>
                <span className={`assignment-status status-${assignment.status}`}>{assignment.status}</span>
                <div className="coverage-lifecycle-actions">
                  {assignment.status === 'accepted' || assignment.status === 'assigned' ? (
                    <button type="button" onClick={() => void updateStatus(assignment, 'completed')}>Mark completed</button>
                  ) : null}
                  {active ? (
                    <button type="button" onClick={() => void updateStatus(assignment, 'canceled')}>Cancel coverage</button>
                  ) : null}
                  {assignment.status !== 'completed' ? (
                    <>
                      <select
                        aria-label={`Replacement teacher for ${assignment.id}`}
                        value={reassignTeacherById[assignment.id] ?? ''}
                        onChange={(event) => setReassignTeacherById((current) => ({ ...current, [assignment.id]: event.target.value }))}
                      >
                        <option value="">Replacement teacher</option>
                        {teachers
                          .filter((teacher) => teacher.id !== assignment.originalTeacherId)
                          .map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                      </select>
                      <button type="button" onClick={() => void reassign(assignment)}>Reassign coverage</button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-note">No substitute assignments loaded.</p>
      )}
    </section>
  );
}

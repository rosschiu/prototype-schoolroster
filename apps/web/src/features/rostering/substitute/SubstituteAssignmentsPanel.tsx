import { useMemo, useState } from 'react';
import type { ClassSession, SubstituteAssignment, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';
import type { RoomOption, TeacherOption } from '../schedule/types.js';
import type { SubstituteAssignmentsApi } from './substituteAssignmentsApi.js';

export function SubstituteAssignmentsPanel({
  api,
  sessions,
  periods,
  teachers,
  rooms,
  currentTeacherId = 'teacher-sub-b'
}: {
  api?: SubstituteAssignmentsApi;
  sessions: ClassSession[];
  periods: TimetablePeriod[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  currentTeacherId?: string;
}) {
  const [assignments, setAssignments] = useState<SubstituteAssignment[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const periodById = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers]);
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms]);

  async function load() {
    setError('');
    setBusy('Loading substitute assignments...');
    try {
      if (api) {
        const result = await api.list({ schoolId: 'school-steck-demo', teacherId: currentTeacherId });
        setAssignments(result.assignments);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Substitute assignments failed to load.');
    } finally {
      setBusy('');
    }
  }

  async function respond(assignment: SubstituteAssignment, status: 'accepted' | 'declined') {
    setError('');
    setBusy(status === 'accepted' ? 'Accepting offer...' : 'Declining offer...');
    try {
      const result = api
        ? await api.respond({ assignmentId: assignment.id, status, teacherId: currentTeacherId })
        : { assignment: { ...assignment, status, acceptedAt: status === 'accepted' ? new Date().toISOString() : assignment.acceptedAt, declinedAt: status === 'declined' ? new Date().toISOString() : assignment.declinedAt } };
      setAssignments((current) => current.map((item) => (item.id === assignment.id ? result.assignment : item)));
      setToast(status === 'accepted' ? 'Substitute offer accepted.' : 'Substitute offer declined.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Substitute response failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="panel-card substitute-assignments-panel" id="substitute-assignments" aria-label="My substitute assignments">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">Teacher</p>
          <h2>My Substitute Assignments</h2>
        </div>
        <button type="button" onClick={() => void load()}>Refresh assignments</button>
      </div>
      {busy ? <div className="toast inline" role="status">{busy}</div> : null}
      {toast && !busy ? <div className="toast inline" role="status">{toast}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {assignments.length ? (
        <div className="substitute-assignment-list">
          {assignments.map((assignment) => {
            const session = sessions.find((item) => item.id === assignment.classSessionId);
            const period = session ? periodById.get(session.timetablePeriodId) : undefined;
            return (
              <article key={assignment.id} className="substitute-assignment-card">
                <div>
                  <strong>{session ? `${session.subjectId} · ${session.gradeLevelId}${session.section}` : assignment.classSessionId}</strong>
                  <span>{period ? `Day ${period.dayIndex} ${period.label} (${period.startTime}-${period.endTime})` : 'Period details pending'}</span>
                  <small>
                    Original: {teacherById.get(assignment.originalTeacherId) ?? assignment.originalTeacherId}
                    {' · '}
                    Room: {session?.roomId ? roomById.get(session.roomId) ?? session.roomId : 'No room'}
                  </small>
                </div>
                <span className={`assignment-status status-${assignment.status}`}>{assignment.status}</span>
                {assignment.status === 'offered' || assignment.status === 'acknowledged' ? (
                  <div className="assignment-actions">
                    <button type="button" onClick={() => void respond(assignment, 'accepted')}>Accept</button>
                    <button type="button" onClick={() => void respond(assignment, 'declined')}>Decline</button>
                  </div>
                ) : null}
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

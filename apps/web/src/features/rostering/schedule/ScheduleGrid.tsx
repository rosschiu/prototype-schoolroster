import type { ClassSession, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';
import type { RoomOption, TeacherOption } from './types.js';
import { sessionsForPeriod } from './scheduleLogic.js';

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function teacherName(teachers: TeacherOption[], id?: string) {
  return teachers.find((teacher) => teacher.id === id)?.name ?? 'Unassigned';
}

function roomName(rooms: RoomOption[], id?: string) {
  return rooms.find((room) => room.id === id)?.name ?? 'No room';
}

export function ScheduleGrid({
  periods,
  sessions,
  teachers,
  rooms,
  onEdit
}: {
  periods: TimetablePeriod[];
  sessions: ClassSession[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  onEdit: (session: ClassSession) => void;
}) {
  const visibleDays = [...new Set(periods.map((period) => period.dayIndex))].sort((a, b) => a - b);
  const periodIndexes = [...new Set(periods.map((period) => period.periodIndex))].sort((a, b) => a - b);

  if (periods.length === 0) {
    return (
      <section className="grid-empty" aria-label="Timetable grid empty">
        <h2>No timetable yet</h2>
        <p>Start from the default template to create editable periods and AM/PM grouping.</p>
      </section>
    );
  }

  return (
    <section className="grid-shell" aria-label="Timetable grid">
      <div className="schedule-grid" style={{ gridTemplateColumns: `120px repeat(${visibleDays.length}, minmax(180px, 1fr))` }}>
        <div className="grid-corner">Period</div>
        {visibleDays.map((dayIndex) => (
          <div className="grid-head" key={dayIndex}>{dayNames[dayIndex - 1] ?? `Day ${dayIndex}`}</div>
        ))}
        {periodIndexes.map((periodIndex) => {
          const firstPeriod = periods.find((period) => period.periodIndex === periodIndex);
          return [
            <div className="period-label" key={`label-${periodIndex}`}>
              <strong>{firstPeriod?.label ?? `P${periodIndex}`}</strong>
              <span>{firstPeriod?.halfDay.toUpperCase()}</span>
            </div>,
            ...visibleDays.map((dayIndex) => {
              const period = periods.find((item) => item.dayIndex === dayIndex && item.periodIndex === periodIndex);
              const periodSessions = period ? sessionsForPeriod(sessions, period) : [];
              return (
                <div className={`grid-cell${period && !period.isTeachingPeriod ? ' non-teaching-cell' : ''}`} key={`${dayIndex}-${periodIndex}`}>
                  {period ? <span className="time-chip">{period.startTime}-{period.endTime}</span> : null}
                  {period && !period.isTeachingPeriod ? <span className="empty-slot">Non-teaching</span> : null}
                  {periodSessions.length === 0 && period?.isTeachingPeriod !== false ? <span className="empty-slot">No class</span> : null}
                  {periodSessions.map((session) => (
                    <button className="session-card" key={session.id} onClick={() => onEdit(session)} type="button">
                      <strong>{session.subjectId}</strong>
                      <span>{session.gradeLevelId}{session.section}</span>
                      <small>{teacherName(teachers, session.assignedTeacherId)} · {roomName(rooms, session.roomId)}</small>
                    </button>
                  ))}
                </div>
              );
            })
          ];
        })}
      </div>
    </section>
  );
}

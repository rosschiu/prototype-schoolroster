import { useMemo, useState } from 'react';
import type { ClassSession } from '../../../../../../packages/contracts/src/rostering.js';
import type { SchedulePlannerState } from './types.js';
import { projectionSessions } from './scheduleLogic.js';

function sessionLabel(session: ClassSession) {
  return `${session.subjectId} · ${session.gradeLevelId}${session.section}`;
}

export function ProjectionViews({ state }: { state: SchedulePlannerState }) {
  const [projectionType, setProjectionType] = useState<'class' | 'teacher' | 'room' | 'equipment'>('class');
  const options = useMemo(() => {
    if (projectionType === 'teacher') return state.teachers.map((teacher) => ({ id: teacher.id, name: teacher.name }));
    if (projectionType === 'room') return state.rooms.map((room) => ({ id: room.id, name: room.name }));
    if (projectionType === 'equipment') return state.resources.map((resource) => ({ id: resource.id, name: resource.name }));
    const classes = [...new Set(state.sessions.map((session) => `${session.gradeLevelId}:${session.section}`))];
    return classes.length > 0 ? classes.map((id) => ({ id, name: id.replace(':', '') })) : [{ id: 'P4:A', name: 'P4A' }];
  }, [projectionType, state.resources, state.rooms, state.sessions, state.teachers]);
  const [ownerId, setOwnerId] = useState(options[0]?.id ?? '');
  const effectiveOwnerId = options.some((option) => option.id === ownerId) ? ownerId : options[0]?.id ?? '';
  const projected = projectionSessions({ state, projectionType, ownerId: effectiveOwnerId });

  return (
    <section className="projection-panel" aria-label="Generated schedule projections">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Generated schedules</p>
          <h2>Projections</h2>
        </div>
        <div className="projection-controls">
          <select aria-label="Projection type" value={projectionType} onChange={(event) => { setProjectionType(event.target.value as typeof projectionType); setOwnerId(''); }}>
            <option value="class">Class</option>
            <option value="teacher">Teacher</option>
            <option value="room">Room</option>
            <option value="equipment">Equipment</option>
          </select>
          <select aria-label="Projection owner" value={effectiveOwnerId} onChange={(event) => setOwnerId(event.target.value)}>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
      </div>
      {projected.length === 0 ? (
        <div className="projection-empty">No schedule found for this view yet.</div>
      ) : (
        <div className="projection-list">
          {projected.map((session) => (
            <article key={session.id}>
              <strong>{sessionLabel(session)}</strong>
              <span>{session.roomId ?? 'No room'} · {session.assignedTeacherId ?? 'Unassigned'}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

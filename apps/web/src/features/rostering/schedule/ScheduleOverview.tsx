import type { SchedulePlannerState } from './types.js';
import { getPlannerWarnings } from './scheduleLogic.js';

export function ScheduleOverview({ state, onStartDefault }: { state: SchedulePlannerState; onStartDefault: () => void }) {
  const warnings = getPlannerWarnings(state);
  const teacherCount = new Set(state.sessions.map((session) => session.assignedTeacherId).filter(Boolean)).size;
  const roomCount = new Set(state.sessions.map((session) => session.roomId).filter(Boolean)).size;

  return (
    <section className="overview-shell" aria-label="Schedule overview">
      <div className="overview-hero">
        <p className="eyebrow">Schedule planner</p>
        <h1>Term roster</h1>
        {!state.timetable ? (
          <button className="primary-button" onClick={onStartDefault} type="button">
            Start from 5-day default
          </button>
        ) : null}
      </div>
      <div className="overview-metrics">
        <article>
          <span>Periods</span>
          <strong>{state.periods.length}</strong>
          <p>{state.periods.filter((period) => period.halfDay === 'am').length} AM / {state.periods.filter((period) => period.halfDay === 'pm').length} PM</p>
        </article>
        <article>
          <span>Sessions</span>
          <strong>{state.sessions.length}</strong>
          <p>{teacherCount} teachers assigned</p>
        </article>
        <article>
          <span>Rooms</span>
          <strong>{roomCount}</strong>
          <p>{state.resources.length} resources available</p>
        </article>
        <article>
          <span>Status</span>
          <strong>{state.published ? 'Published' : 'Draft'}</strong>
          <p>{state.timetable?.name ?? 'No timetable yet'}</p>
        </article>
      </div>
      <div className="warning-strip" aria-label="Publish readiness warnings">
        {warnings.map((warning) => (
          <article className={`warning-card ${warning.tone}`} key={warning.id}>
            <strong>{warning.title}</strong>
            <p>{warning.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

import type { SchedulePlannerState } from './types.js';
import { getPlannerWarnings } from './scheduleLogic.js';

export function PublishPanel({ state, onPublish, onUnpublish }: { state: SchedulePlannerState; onPublish: () => void; onUnpublish: () => void }) {
  const warnings = getPlannerWarnings(state);
  const blocking = warnings.filter((warning) => warning.tone === 'danger' || warning.id === 'no-sessions');

  return (
    <section className="publish-panel" aria-label="Publish readiness">
      <div>
        <p className="eyebrow">Publish readiness</p>
        <h2>{state.published ? 'Published' : 'Ready check'}</h2>
      </div>
      <ul>
        {warnings.map((warning) => (
          <li key={warning.id} className={warning.tone}>{warning.title}</li>
        ))}
      </ul>
      {state.published ? (
        <button className="secondary-button" type="button" onClick={onUnpublish}>Unpublish draft</button>
      ) : (
        <button className="primary-button" type="button" disabled={!state.timetable || blocking.length > 0} onClick={onPublish}>Publish schedule</button>
      )}
    </section>
  );
}

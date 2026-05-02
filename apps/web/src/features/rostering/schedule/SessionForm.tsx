import { useEffect, useState } from 'react';
import type { ClassSession, Timetable, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';
import type { ResourceOption, RoomOption, SessionDraft, TeacherOption } from './types.js';
import { TeacherAssignmentSelect } from './TeacherAssignmentSelect.js';
import { emptySessionDraft, validateSessionDraft } from './scheduleLogic.js';

function draftFromSession(session: ClassSession | null): SessionDraft {
  if (!session) return emptySessionDraft;
  return {
    timetablePeriodId: session.timetablePeriodId,
    subjectId: session.subjectId,
    gradeLevelId: session.gradeLevelId,
    section: session.section,
    roomId: session.roomId ?? '',
    assignedTeacherId: session.assignedTeacherId ?? '',
    equipmentResourceIds: session.equipmentResourceIds,
    notes: session.notes ?? ''
  };
}

export function SessionForm({
  timetable,
  periods,
  sessions,
  teachers,
  rooms,
  resources,
  editingSession,
  onSave,
  onCancel
}: {
  timetable: Timetable | null;
  periods: TimetablePeriod[];
  sessions: ClassSession[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  resources: ResourceOption[];
  editingSession: ClassSession | null;
  onSave: (draft: SessionDraft, editingSessionId?: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SessionDraft>(draftFromSession(editingSession));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setDraft(draftFromSession(editingSession));
    setSubmitted(false);
  }, [editingSession]);

  const errors = validateSessionDraft({ draft, sessions, editingSessionId: editingSession?.id });

  if (!timetable) {
    return (
      <section className="side-panel empty-panel" aria-label="Session form">
        <h2>Add session</h2>
        <p>Start from a default timetable first. The form will unlock after periods exist.</p>
      </section>
    );
  }

  if (!timetable.structureConfirmedAt) {
    return (
      <section className="side-panel empty-panel" aria-label="Session form">
        <h2>Add session</h2>
        <p>Confirm the timetable structure before adding class sessions.</p>
      </section>
    );
  }

  const teachingPeriods = periods.filter((period) => period.isTeachingPeriod);

  return (
    <form
      className="side-panel"
      aria-label="Session form"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (errors.length === 0) {
          onSave(draft, editingSession?.id);
          setDraft(emptySessionDraft);
          setSubmitted(false);
        }
      }}
    >
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Session editor</p>
          <h2>{editingSession ? 'Amend class session' : 'Add class session'}</h2>
        </div>
        {editingSession ? (
          <button className="ghost-button" type="button" onClick={onCancel}>
            Cancel edit
          </button>
        ) : null}
      </div>

      {submitted && errors.length > 0 ? (
        <div className="inline-error" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <label className="field-stack">
        <span>Period</span>
        <select
          aria-label="Period"
          value={draft.timetablePeriodId}
          onChange={(event) => setDraft((current) => ({ ...current, timetablePeriodId: event.target.value }))}
        >
          <option value="">Choose period</option>
          {teachingPeriods.map((period) => (
            <option key={period.id} value={period.id}>
              Day {period.dayIndex} {period.label} ({period.halfDay.toUpperCase()}) {period.startTime}-{period.endTime}
            </option>
          ))}
        </select>
      </label>

      <div className="form-grid-two">
        <label className="field-stack">
          <span>Subject</span>
          <input
            aria-label="Subject"
            value={draft.subjectId}
            onChange={(event) => setDraft((current) => ({ ...current, subjectId: event.target.value }))}
          />
        </label>
        <label className="field-stack">
          <span>Class</span>
          <input
            aria-label="Class section"
            value={`${draft.gradeLevelId}${draft.section}`}
            onChange={(event) => {
              const cleaned = event.target.value.trim().toUpperCase();
              setDraft((current) => ({ ...current, gradeLevelId: cleaned.slice(0, -1) || current.gradeLevelId, section: cleaned.slice(-1) || current.section }));
            }}
          />
        </label>
      </div>

      <TeacherAssignmentSelect
        teachers={teachers}
        sessions={sessions}
        periodId={draft.timetablePeriodId}
        value={draft.assignedTeacherId}
        editingSessionId={editingSession?.id}
        onChange={(assignedTeacherId) => setDraft((current) => ({ ...current, assignedTeacherId }))}
      />

      <label className="field-stack">
        <span>Room</span>
        <select aria-label="Room" value={draft.roomId} onChange={(event) => setDraft((current) => ({ ...current, roomId: event.target.value }))}>
          <option value="">Choose room</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="resource-fieldset">
        <legend>Equipment/resources</legend>
        {resources.map((resource) => (
          <label key={resource.id}>
            <input
              type="checkbox"
              checked={draft.equipmentResourceIds.includes(resource.id)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  equipmentResourceIds: event.target.checked
                    ? [...current.equipmentResourceIds, resource.id]
                    : current.equipmentResourceIds.filter((id) => id !== resource.id)
                }))
              }
            />
            {resource.name}
          </label>
        ))}
      </fieldset>

      <label className="field-stack">
        <span>Notes</span>
        <textarea aria-label="Notes" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
      </label>

      <button className="primary-button" type="submit">
        {editingSession ? 'Save amendment' : 'Add session'}
      </button>
    </form>
  );
}

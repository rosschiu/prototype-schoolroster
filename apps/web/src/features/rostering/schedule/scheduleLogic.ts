import type { ClassSession, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';
import type { PlannerWarning, SchedulePlannerState, SessionDraft, TeacherOption } from './types.js';

export const emptySessionDraft: SessionDraft = {
  timetablePeriodId: '',
  subjectId: 'Math',
  gradeLevelId: 'P4',
  section: 'A',
  roomId: '',
  assignedTeacherId: '',
  equipmentResourceIds: [],
  notes: ''
};

export function findBusyTeacher({
  sessions,
  periodId,
  teacherId,
  ignoreSessionId
}: {
  sessions: ClassSession[];
  periodId: string;
  teacherId: string;
  ignoreSessionId?: string;
}): ClassSession | undefined {
  return sessions.find(
    (session) =>
      session.id !== ignoreSessionId &&
      session.status !== 'cancelled' &&
      session.timetablePeriodId === periodId &&
      session.assignedTeacherId === teacherId
  );
}

export function findBusyRoom({
  sessions,
  periodId,
  roomId,
  ignoreSessionId
}: {
  sessions: ClassSession[];
  periodId: string;
  roomId: string;
  ignoreSessionId?: string;
}): ClassSession | undefined {
  return sessions.find(
    (session) =>
      session.id !== ignoreSessionId &&
      session.status !== 'cancelled' &&
      session.timetablePeriodId === periodId &&
      session.roomId === roomId
  );
}

export function getTeacherConflictLabel({
  sessions,
  periodId,
  teacher,
  ignoreSessionId
}: {
  sessions: ClassSession[];
  periodId: string;
  teacher: TeacherOption;
  ignoreSessionId?: string;
}): string | null {
  const conflict = findBusyTeacher({ sessions, periodId, teacherId: teacher.id, ignoreSessionId });
  if (!conflict) return null;
  return `${teacher.name} already teaches ${conflict.gradeLevelId}${conflict.section} in this period.`;
}

export function validateSessionDraft({
  draft,
  sessions,
  editingSessionId
}: {
  draft: SessionDraft;
  sessions: ClassSession[];
  editingSessionId?: string;
}): string[] {
  const errors: string[] = [];
  if (!draft.timetablePeriodId) errors.push('Choose a period.');
  if (!draft.subjectId.trim()) errors.push('Enter a subject.');
  if (!draft.gradeLevelId.trim()) errors.push('Enter a grade.');
  if (!draft.section.trim()) errors.push('Enter a section.');
  if (!draft.roomId) errors.push('Choose a room.');
  if (!draft.assignedTeacherId) errors.push('Choose a teacher.');
  if (draft.assignedTeacherId && draft.timetablePeriodId) {
    const teacherConflict = findBusyTeacher({
      sessions,
      periodId: draft.timetablePeriodId,
      teacherId: draft.assignedTeacherId,
      ignoreSessionId: editingSessionId
    });
    if (teacherConflict) errors.push('This teacher is already assigned to a session at this time.');
  }
  if (draft.roomId && draft.timetablePeriodId) {
    const roomConflict = findBusyRoom({
      sessions,
      periodId: draft.timetablePeriodId,
      roomId: draft.roomId,
      ignoreSessionId: editingSessionId
    });
    if (roomConflict) errors.push('This room is already booked at this time.');
  }
  return errors;
}

export function getPlannerWarnings(state: SchedulePlannerState): PlannerWarning[] {
  if (!state.timetable) {
    return [
      {
        id: 'empty',
        tone: 'warning',
        title: 'No timetable yet',
        detail: 'Start from the five-day default template, then amend periods before publishing.'
      }
    ];
  }
  const warnings: PlannerWarning[] = [];
  if (!state.timetable.structureConfirmedAt) {
    warnings.push({
      id: 'structure-unconfirmed',
      tone: 'danger',
      title: 'Timetable structure not confirmed',
      detail: 'Review period labels, times, AM/PM grouping, and teaching blocks before adding sessions or publishing.'
    });
  }
  if (state.sessions.length === 0) {
    warnings.push({
      id: 'no-sessions',
      tone: 'warning',
      title: 'No class sessions yet',
      detail: 'Add at least one session before publishing so teachers have a roster to review.'
    });
  }
  const uncovered = state.sessions.filter((session) => !session.assignedTeacherId).length;
  if (uncovered > 0) {
    warnings.push({
      id: 'uncovered',
      tone: 'danger',
      title: `${uncovered} session${uncovered === 1 ? '' : 's'} without teacher`,
      detail: 'Assign a teacher or remove the draft session before publishing.'
    });
  }
  if (
    state.periods.filter((period) => period.isTeachingPeriod && period.halfDay === 'am').length === 0 ||
    state.periods.filter((period) => period.isTeachingPeriod && period.halfDay === 'pm').length === 0
  ) {
    warnings.push({
      id: 'half-day',
      tone: 'danger',
      title: 'AM/PM grouping incomplete',
      detail: 'Half-day leave relies on period grouping. Keep at least one AM and one PM period.'
    });
  }
  if (warnings.length === 0) {
    warnings.push({
      id: 'ready',
      tone: 'success',
      title: 'Ready to publish',
      detail: 'The draft has sessions, teacher assignments, and AM/PM grouping.'
    });
  }
  return warnings;
}

export function sessionsForPeriod(sessions: ClassSession[], period: TimetablePeriod): ClassSession[] {
  return sessions.filter((session) => session.timetablePeriodId === period.id && session.status !== 'cancelled');
}

export function projectionSessions({
  state,
  projectionType,
  ownerId
}: {
  state: SchedulePlannerState;
  projectionType: 'class' | 'teacher' | 'room' | 'equipment';
  ownerId: string;
}): ClassSession[] {
  return state.sessions.filter((session) => {
    if (session.status === 'cancelled') return false;
    if (projectionType === 'class') return `${session.gradeLevelId}:${session.section}` === ownerId;
    if (projectionType === 'teacher') return session.assignedTeacherId === ownerId;
    if (projectionType === 'room') return session.roomId === ownerId;
    return session.equipmentResourceIds.includes(ownerId);
  });
}

import type { ClassSession } from '../../../../../../packages/contracts/src/rostering.js';
import type { TeacherOption } from './types.js';
import { getTeacherConflictLabel } from './scheduleLogic.js';

export function TeacherAssignmentSelect({
  teachers,
  sessions,
  periodId,
  value,
  editingSessionId,
  onChange
}: {
  teachers: TeacherOption[];
  sessions: ClassSession[];
  periodId: string;
  value: string;
  editingSessionId?: string;
  onChange: (teacherId: string) => void;
}) {
  return (
    <label className="field-stack">
      <span>Teacher</span>
      <select aria-label="Teacher" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose teacher</option>
        {teachers.map((teacher) => {
          const conflict = periodId ? getTeacherConflictLabel({ sessions, periodId, teacher, ignoreSessionId: editingSessionId }) : null;
          return (
            <option key={teacher.id} value={teacher.id} disabled={Boolean(conflict)}>
              {teacher.name} {conflict ? `- busy` : `- ${teacher.subjects.join(', ')}`}
            </option>
          );
        })}
      </select>
      {periodId ? (
        <div className="teacher-hints" aria-live="polite">
          {teachers.map((teacher) => {
            const conflict = getTeacherConflictLabel({ sessions, periodId, teacher, ignoreSessionId: editingSessionId });
            return conflict ? (
              <span className="busy-chip" key={teacher.id}>
                {conflict}
              </span>
            ) : null;
          })}
        </div>
      ) : null}
    </label>
  );
}

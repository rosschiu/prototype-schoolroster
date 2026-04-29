import type { ClassSession, Timetable, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';
import type { ResourceOption, RoomOption, SchedulePlannerState, TeacherOption } from './types.js';

const now = '2026-04-27T00:00:00.000Z';

export const teachers: TeacherOption[] = [
  { id: 'teacher-demo', name: 'Ms. Chan', subjects: ['Math', 'STEM'] },
  { id: 'teacher-lam', name: 'Mr. Lam', subjects: ['English', 'Humanities'] },
  { id: 'teacher-wong', name: 'Ms. Wong', subjects: ['Science', 'Math'] },
  { id: 'teacher-lee', name: 'Mr. Lee', subjects: ['PE', 'Wellbeing'] },
  { id: 'teacher-sub-b', name: 'Substitute B', subjects: ['Math', 'Science'] },
  { id: 'teacher-multirole-demo', name: 'Multi Role Demo', subjects: ['Math', 'Science', 'English'] }
];

export const rooms: RoomOption[] = [
  { id: 'room-101', name: 'Room 101' },
  { id: 'room-102', name: 'Room 102' },
  { id: 'lab-1', name: 'STEM Lab' },
  { id: 'hall', name: 'Main Hall' }
];

export const resources: ResourceOption[] = [
  { id: 'projector-1', name: 'Projector A' },
  { id: 'speaker-1', name: 'Portable speaker' },
  { id: 'science-cart', name: 'Science cart' }
];

export function createDefaultTimetable(): { timetable: Timetable; periods: TimetablePeriod[] } {
  const timetable: Timetable = {
    id: 'timetable-demo',
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    name: '2026 Term 1 working draft',
    status: 'draft',
    templateKey: 'hk-five-day-eight-periods',
    timezone: 'Asia/Hong_Kong',
    createdAt: now,
    updatedAt: now
  };
  const seeds = [
    ['P1', '08:30', '09:10', 'am'],
    ['P2', '09:15', '09:55', 'am'],
    ['P3', '10:15', '10:55', 'am'],
    ['P4', '11:00', '11:40', 'am'],
    ['P5', '13:00', '13:40', 'pm'],
    ['P6', '13:45', '14:25', 'pm'],
    ['P7', '14:40', '15:20', 'pm'],
    ['P8', '15:25', '16:05', 'pm']
  ] as const;
  const periods = Array.from({ length: 5 }, (_, dayOffset) =>
    seeds.map(([label, startTime, endTime, halfDay], index) => ({
      id: `period-${dayOffset + 1}-${index + 1}`,
      timetableId: timetable.id,
      schoolId: timetable.schoolId,
      dayIndex: dayOffset + 1,
      periodIndex: index + 1,
      label,
      startTime,
      endTime,
      halfDay,
      sortOrder: dayOffset * seeds.length + index + 1
    }))
  ).flat();
  return { timetable, periods };
}

export function createInitialPlannerState(): SchedulePlannerState {
  return {
    timetable: null,
    periods: [],
    sessions: [],
    teachers,
    rooms,
    resources,
    published: false
  };
}

export function createDemoSession(input: {
  id: string;
  timetable: Timetable;
  period: TimetablePeriod;
  subjectId: string;
  gradeLevelId: string;
  section: string;
  roomId: string;
  assignedTeacherId: string;
  equipmentResourceIds?: string[];
}): ClassSession {
  return {
    id: input.id,
    schoolId: input.timetable.schoolId,
    termId: input.timetable.termId,
    timetableId: input.timetable.id,
    timetablePeriodId: input.period.id,
    subjectId: input.subjectId,
    gradeLevelId: input.gradeLevelId,
    section: input.section,
    roomId: input.roomId,
    assignedTeacherId: input.assignedTeacherId,
    equipmentResourceIds: input.equipmentResourceIds ?? [],
    status: 'draft',
    createdAt: now,
    updatedAt: now
  };
}

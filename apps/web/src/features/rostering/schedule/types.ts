import type { ClassSession, Timetable, TimetablePeriod } from '../../../../../../packages/contracts/src/rostering.js';

export type TeacherOption = {
  id: string;
  name: string;
  subjects: string[];
};

export type RoomOption = {
  id: string;
  name: string;
};

export type ResourceOption = {
  id: string;
  name: string;
};

export type SchedulePlannerState = {
  timetable: Timetable | null;
  periods: TimetablePeriod[];
  sessions: ClassSession[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  resources: ResourceOption[];
  published: boolean;
};

export type SessionDraft = {
  timetablePeriodId: string;
  subjectId: string;
  gradeLevelId: string;
  section: string;
  roomId: string;
  assignedTeacherId: string;
  equipmentResourceIds: string[];
  notes: string;
};

export type PlannerWarning = {
  id: string;
  tone: 'warning' | 'danger' | 'success';
  title: string;
  detail: string;
};

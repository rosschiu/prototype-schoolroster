export type TimetableStatus = 'draft' | 'published' | 'archived';
export type TimetablePeriodHalfDay = 'am' | 'pm';
export type ClassSessionStatus = 'draft' | 'published' | 'archived' | 'cancelled';
export type ScheduleProjectionType = 'class' | 'teacher' | 'room' | 'equipment';

export type Timetable = {
  id: string;
  schoolId: string;
  termId: string;
  name: string;
  status: TimetableStatus;
  templateKey?: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type TimetablePeriod = {
  id: string;
  timetableId: string;
  schoolId: string;
  dayIndex: number;
  periodIndex: number;
  label: string;
  startTime: string;
  endTime: string;
  halfDay: TimetablePeriodHalfDay;
  sortOrder: number;
};

export type ClassSession = {
  id: string;
  schoolId: string;
  termId: string;
  timetableId: string;
  timetablePeriodId: string;
  subjectId: string;
  gradeLevelId: string;
  section: string;
  roomId?: string;
  equipmentResourceIds: string[];
  assignedTeacherId?: string;
  status: ClassSessionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTimetableRequest = {
  schoolId: string;
  termId: string;
  name: string;
  templateKey?: string;
  timezone?: string;
};

export type CreateTimetableResponse = {
  timetable: Timetable;
  periods: TimetablePeriod[];
};

export type CreateClassSessionRequest = Omit<ClassSession, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  id?: string;
  status?: ClassSessionStatus;
};

export type UpdateClassSessionRequest = Partial<
  Pick<
    ClassSession,
    | 'timetablePeriodId'
    | 'subjectId'
    | 'gradeLevelId'
    | 'section'
    | 'roomId'
    | 'assignedTeacherId'
    | 'equipmentResourceIds'
    | 'status'
    | 'notes'
  >
>;

export type ScheduleProjection = {
  projectionType: ScheduleProjectionType;
  ownerId: string;
  sessions: Array<ClassSession & { period: TimetablePeriod }>;
};

export type LeaveDurationType = 'full_day' | 'am_half_day' | 'pm_half_day';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveImpactCoverageStatus = 'unfilled' | 'assigned' | 'covered' | 'no_coverage_needed' | 'cancelled';
export type LeaveImpactSource = 'system_computed' | 'admin_added' | 'admin_removed';

export type LeaveRequest = {
  id: string;
  schoolId: string;
  teacherId: string;
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  leaveType: string;
  reason?: string;
  coverageRequired: boolean;
  substituteNotes?: string;
  status: LeaveRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdBy: string;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type LeaveSessionImpact = {
  id: string;
  schoolId: string;
  leaveRequestId: string;
  classSessionId: string;
  impactDate: string;
  coverageRequired: boolean;
  coverageStatus: LeaveImpactCoverageStatus;
  status: 'active' | 'inactive';
  source: LeaveImpactSource;
  warningCodes: string[];
  adminAdjustmentReason?: string;
  adjustedBy?: string;
  adjustedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateLeaveRequest = {
  schoolId: string;
  termId: string;
  teacherId: string;
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  leaveType: string;
  reason?: string;
  coverageRequired?: boolean;
  substituteNotes?: string;
};

export type SubstituteRecommendationStatus = 'queued' | 'running' | 'completed' | 'failed';

export type SubstituteRecommendationCriterionBreakdown = {
  score: number;
  weight: number;
  contribution: number;
  detail: string;
  rule_ids?: string[];
};

export type SubstituteRecommendation = {
  teacher_id: string;
  teacher_name: string;
  composite_score: number;
  rank: number;
  is_feasible: true;
  breakdown: {
    workload_balance: SubstituteRecommendationCriterionBreakdown;
    subject_competency: SubstituteRecommendationCriterionBreakdown;
    class_familiarity: SubstituteRecommendationCriterionBreakdown;
    recency_penalty: SubstituteRecommendationCriterionBreakdown;
    preference_policy: SubstituteRecommendationCriterionBreakdown;
  };
  raw_inputs: {
    term_sub_units: number;
    week_sub_units: number;
    capacity_factor: number;
    raw_workload: number;
    competency_level: string | null;
    grade_multiplier: number;
    credential_bonus: number;
    credential_penalty: number;
    days_since_last_sub: number | null;
    familiarity_signals: Record<string, number>;
    preference_rule_ids: string[];
  };
  reason_codes: string[];
};

export type SubstituteAssignmentStatus = 'unfilled' | 'assigned' | 'offered' | 'acknowledged' | 'accepted' | 'declined' | 'completed' | 'canceled';

export type SubstituteAssignment = {
  id: string;
  schoolId: string;
  leaveRequestId: string;
  classSessionId: string;
  originalTeacherId: string;
  substituteTeacherId: string;
  assignedBy: string;
  assignedAt: string;
  status: SubstituteAssignmentStatus;
  acknowledgedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  cancellationReason?: string;
};

export type CreateSubstituteAssignmentRequest = {
  leaveId: string;
  sessionId: string;
  substituteTeacherId: string;
};

export type UpdateSubstituteAssignmentStatusRequest = {
  status: 'accepted' | 'declined' | 'canceled' | 'completed';
  cancellationReason?: string;
};

export type ReassignSubstituteAssignmentRequest = {
  substituteTeacherId: string;
  cancellationReason?: string;
};

export type UnfilledCoverageQueueItem = {
  leaveRequest: LeaveRequest;
  impact: LeaveSessionImpact;
  classSession?: ClassSession;
};

export type SubstituteRuleCriteriaKey =
  | 'workload_balance'
  | 'subject_competency'
  | 'class_familiarity'
  | 'recency_penalty'
  | 'preference_policy'
  | 'weekly_substitute_cap'
  | 'hard_constraints'
  | 'exclusion';

export type SubstituteRuleConfig = {
  id: string;
  schoolId: string;
  criteriaKey: SubstituteRuleCriteriaKey;
  weight?: number | null;
  enabled: boolean;
  customParams: Record<string, unknown>;
  updatedAt: string;
};

export type PatchSubstituteRuleConfigRequest = {
  schoolId: string;
  rules: Array<{
    criteriaKey: SubstituteRuleCriteriaKey;
    weight?: number | null;
    enabled: boolean;
    customParams?: Record<string, unknown>;
  }>;
};

export type SubstitutePreferenceRuleScope =
  | 'schedule_session'
  | 'original_teacher'
  | 'subject_grade'
  | 'subject'
  | 'teacher'
  | 'school';

export type SubstitutePreferenceRuleType = 'preferred' | 'soft_avoid' | 'hard_exclusion';

export type SubstitutePreferenceRule = {
  id: string;
  schoolId: string;
  substituteTeacherId: string;
  scope: SubstitutePreferenceRuleScope;
  preferenceType: SubstitutePreferenceRuleType;
  weight?: number | null;
  scheduleSessionId?: string;
  originalTeacherId?: string;
  subjectId?: string;
  gradeLevelId?: string;
  reason?: string;
  enabled: boolean;
  updatedBy: string;
  updatedAt: string;
};

export type PatchSubstitutePreferenceRulesRequest = {
  schoolId: string;
  rules: Array<{
    id?: string;
    substituteTeacherId: string;
    scope: SubstitutePreferenceRuleScope;
    preferenceType: SubstitutePreferenceRuleType;
    weight?: number | null;
    scheduleSessionId?: string;
    originalTeacherId?: string;
    subjectId?: string;
    gradeLevelId?: string;
    reason?: string;
    enabled?: boolean;
  }>;
  deleteRuleIds?: string[];
};

export type SubstituteRecommendationJob = {
  job_id: string;
  status: SubstituteRecommendationStatus;
  current_step: string;
  progress: number;
  school_id: string;
  leave_id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  result?: {
    recommendations: SubstituteRecommendation[];
    reason_codes: string[];
  };
  error?: string;
};

export type SubstituteAvailabilityStatus = 'available' | 'unavailable' | 'limited';

export type SubstituteAvailability = {
  id: string;
  schoolId: string;
  teacherId: string;
  date: string;
  timetablePeriodId?: string;
  availabilityStatus: SubstituteAvailabilityStatus;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
};

export type PatchSubstituteAvailabilityRequest = {
  schoolId: string;
  teacherId: string;
  records: Array<{
    date: string;
    timetablePeriodId?: string;
    availabilityStatus: SubstituteAvailabilityStatus;
    reason?: string;
  }>;
};

export type RosterAuditLogEntry = {
  id: string;
  schoolId: string;
  actorUserId: string;
  actorRole: string;
  eventType: string;
  objectType: string;
  objectId: string;
  message: string;
  reason?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

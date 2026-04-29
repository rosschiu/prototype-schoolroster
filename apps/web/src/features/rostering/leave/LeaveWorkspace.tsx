import { useMemo, useState } from 'react';
import type {
  ClassSession,
  LeaveDurationType,
  LeaveImpactCoverageStatus,
  LeaveRequestStatus,
  LeaveSessionImpact,
  SubstituteRecommendation,
  TimetablePeriod
} from '../../../../../../packages/contracts/src/rostering.js';
import type { ResourceOption, RoomOption, TeacherOption } from '../schedule/types.js';
import type { SubstituteRecommendationApi } from '../substitute/substituteRecommendationApi.js';
import type { LeaveApi } from './leaveApi.js';

type LeaveRecord = {
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
  reviewedAt?: string;
  createdBy: string;
  adminCreateReason?: string;
  impacts: LeaveSessionImpact[];
  createdAt: string;
};

type LeaveDraft = {
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  leaveType: string;
  coverageRequired: boolean;
  reason: string;
  substituteNotes: string;
};

type NotificationEntry = {
  id: string;
  eventType: string;
  title: string;
  target: string;
};

type RecommendationPanelState = {
  status: 'idle' | 'running' | 'completed' | 'failed';
  jobId?: string;
  progress: number;
  currentStep?: string;
  recommendations: SubstituteRecommendation[];
  reasonCodes: string[];
  error?: string;
  selectedTeacherId?: string;
  offerStatus?: 'idle' | 'sending' | 'offered' | 'failed';
  offerError?: string;
  manualOverride?: {
    teacherId: string;
    teacherName: string;
    availabilityLabel: string;
    confirmedAt: string;
  };
};

type LeaveWorkspaceProps = {
  sessions: ClassSession[];
  periods: TimetablePeriod[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  resources: ResourceOption[];
  schedulePublished: boolean;
  currentTeacherId?: string;
  api?: LeaveApi;
  recommendationApi?: SubstituteRecommendationApi;
};

const initialDraft: LeaveDraft = {
  startDate: '2026-05-04',
  endDate: '2026-05-04',
  durationType: 'full_day',
  leaveType: 'sick',
  coverageRequired: true,
  reason: '',
  substituteNotes: ''
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function eachDateInclusive(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(dateKey(cursor));
  }
  return dates;
}

function dayIndexForDate(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function durationLabel(durationType: LeaveDurationType): string {
  return {
    full_day: 'Full day',
    am_half_day: 'AM half day',
    pm_half_day: 'PM half day'
  }[durationType];
}

function statusLabel(status: LeaveRequestStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function coverageLabel(status: LeaveImpactCoverageStatus): string {
  return status.replaceAll('_', ' ');
}

function sessionLabel(session: ClassSession, period?: TimetablePeriod, rooms: RoomOption[] = []): string {
  const room = rooms.find((item) => item.id === session.roomId)?.name ?? session.roomId ?? 'No room';
  const periodLabel = period ? `D${period.dayIndex} ${period.label}` : 'Unmapped period';
  return `${periodLabel} · ${session.subjectId} · ${session.gradeLevelId}${session.section} · ${room}`;
}

function notificationId() {
  return `notification-${Math.random().toString(36).slice(2)}`;
}

function recommendationStateFromCompleted(input: {
  recommendations: SubstituteRecommendation[];
  reasonCodes?: string[];
  jobId?: string;
}): RecommendationPanelState {
  return {
    status: 'completed',
    jobId: input.jobId,
    progress: 1,
    currentStep: 'completed',
    recommendations: input.recommendations,
    reasonCodes: input.reasonCodes ?? []
  };
}

function demoRecommendations(teachers: TeacherOption[], originalTeacherId?: string): SubstituteRecommendation[] {
  return teachers
    .filter((teacher) => teacher.id !== originalTeacherId)
    .slice(0, 3)
    .map((teacher, index) => {
      const score = Math.max(0.55, 0.92 - index * 0.12);
      return {
        teacher_id: teacher.id,
        teacher_name: teacher.name,
        composite_score: score,
        rank: index + 1,
        is_feasible: true,
        breakdown: {
          workload_balance: { score, weight: 0.3, contribution: score * 0.3, detail: 'Demo workload balance' },
          subject_competency: { score: Math.max(0.5, score - 0.05), weight: 0.35, contribution: Math.max(0.5, score - 0.05) * 0.35, detail: 'Demo subject match' },
          class_familiarity: { score: Math.max(0.35, score - 0.18), weight: 0.2, contribution: Math.max(0.35, score - 0.18) * 0.2, detail: 'Demo class familiarity' },
          recency_penalty: { score: 1, weight: 0.15, contribution: 0.15, detail: 'No recent substitute duty' },
          preference_policy: { score: 0.5, weight: 0, contribution: 0, detail: 'No matching preference rules', rule_ids: [] }
        },
        raw_inputs: {
          term_sub_units: index,
          week_sub_units: 0,
          capacity_factor: 1,
          raw_workload: index,
          competency_level: index === 0 ? 'primary' : 'capable',
          grade_multiplier: 1,
          credential_bonus: 0,
          credential_penalty: 0,
          days_since_last_sub: null,
          familiarity_signals: { exact_signal: 0, section_signal: 0, subject_grade_signal: 0 },
          preference_rule_ids: []
        },
        reason_codes: index === 0 ? ['LOW_WORKLOAD', 'PRIMARY_SUBJECT_MATCH'] : ['LOW_WORKLOAD']
      };
    });
}

export function LeaveWorkspace({
  sessions,
  periods,
  teachers,
  rooms,
  schedulePublished,
  currentTeacherId = 'teacher-demo',
  api,
  recommendationApi
}: LeaveWorkspaceProps) {
  const [draft, setDraft] = useState<LeaveDraft>(initialDraft);
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string>('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [sessionToAdd, setSessionToAdd] = useState('');
  const [adminTeacherId, setAdminTeacherId] = useState(currentTeacherId);
  const [adminCreateReason, setAdminCreateReason] = useState('');
  const [toast, setToast] = useState('');
  const [formError, setFormError] = useState('');
  const [adminError, setAdminError] = useState('');
  const [apiBusy, setApiBusy] = useState('');
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [recommendationsByImpact, setRecommendationsByImpact] = useState<Record<string, RecommendationPanelState>>({});

  const periodsById = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);
  const activeSessions = useMemo(() => sessions.filter((session) => session.status !== 'cancelled'), [sessions]);
  const currentTeacher = teachers.find((teacher) => teacher.id === currentTeacherId);

  const previewForTeacher = (teacherId: string) => {
    const dates = eachDateInclusive(draft.startDate, draft.endDate);
    return dates.flatMap((date) => {
      const dayIndex = dayIndexForDate(date);
      return activeSessions
        .filter((session) => session.assignedTeacherId === teacherId)
        .filter((session) => {
          const period = periodsById.get(session.timetablePeriodId);
          if (!period || period.dayIndex !== dayIndex) return false;
          if (draft.durationType === 'full_day') return true;
          return period.halfDay === (draft.durationType === 'am_half_day' ? 'am' : 'pm');
        })
        .map((session) => ({ session, period: periodsById.get(session.timetablePeriodId), impactDate: date }));
    });
  };

  const preview = useMemo(() => previewForTeacher(currentTeacherId), [activeSessions, currentTeacherId, draft.durationType, draft.endDate, draft.startDate, periodsById]);

  const selectedLeave = records.find((record) => record.id === selectedLeaveId) ?? records[0];
  const sessionsAvailableToAdd = selectedLeave
    ? activeSessions.filter((session) => !selectedLeave.impacts.some((impact) => impact.classSessionId === session.id && impact.status === 'active'))
    : [];

  function pushNotification(entry: Omit<NotificationEntry, 'id'>) {
    setNotifications((current) => [{ id: notificationId(), ...entry }, ...current].slice(0, 6));
  }

  function updateDraft<K extends keyof LeaveDraft>(key: K, value: LeaveDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function createLeaveRecord({
    teacherId,
    createdBy,
    adminReason
  }: {
    teacherId: string;
    createdBy: string;
    adminReason?: string;
  }) {
    setFormError('');
    if (!draft.startDate || !draft.endDate || eachDateInclusive(draft.startDate, draft.endDate).length === 0) {
      setFormError('Choose a valid start and end date.');
      return null;
    }
    if (!draft.leaveType) {
      setFormError('Choose a leave type.');
      return null;
    }
    const now = new Date().toISOString();
    const id = `leave-${records.length + 1}`;
    if (api) {
      const result = createdBy === 'user-admin-demo'
        ? await api.createAdminLeave({
            teacherId,
            startDate: draft.startDate,
            endDate: draft.endDate,
            durationType: draft.durationType,
            leaveType: draft.leaveType,
            coverageRequired: draft.coverageRequired,
            reason: draft.reason.trim() || undefined,
            substituteNotes: draft.substituteNotes.trim() || undefined,
            adminCreateReason: adminReason,
            sessions: activeSessions,
            periods
          })
        : await api.createTeacherLeave({
            teacherId,
            startDate: draft.startDate,
            endDate: draft.endDate,
            durationType: draft.durationType,
            leaveType: draft.leaveType,
            coverageRequired: draft.coverageRequired,
            reason: draft.reason.trim() || undefined,
            substituteNotes: draft.substituteNotes.trim() || undefined,
            sessions: activeSessions,
            periods
          });
      const record: LeaveRecord = {
        ...result.leaveRequest,
        createdBy,
        adminCreateReason: adminReason,
        impacts: result.impacts
      };
      setRecords((current) => [record, ...current]);
      setSelectedLeaveId(record.id);
      return record;
    }
    const impacts: LeaveSessionImpact[] = previewForTeacher(teacherId).map((item, index) => ({
      id: `${id}-impact-${index + 1}`,
      schoolId: 'school-steck-demo',
      leaveRequestId: id,
      classSessionId: item.session.id,
      impactDate: item.impactDate,
      coverageRequired: draft.coverageRequired,
      coverageStatus: draft.coverageRequired ? 'unfilled' : 'no_coverage_needed',
      status: 'active',
      source: 'system_computed',
      warningCodes: [],
      createdAt: now,
      updatedAt: now
    }));
    const record: LeaveRecord = {
      id,
      schoolId: 'school-steck-demo',
      teacherId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      durationType: draft.durationType,
      leaveType: draft.leaveType,
      reason: draft.reason.trim() || undefined,
      coverageRequired: draft.coverageRequired,
      substituteNotes: draft.substituteNotes.trim() || undefined,
      status: 'pending',
      createdBy,
      adminCreateReason: adminReason,
      impacts,
      createdAt: now
    };
    setRecords((current) => [record, ...current]);
    setSelectedLeaveId(record.id);
    return record;
  }

  async function submitLeave() {
    setApiBusy('Submitting leave through API...');
    let record: LeaveRecord | null = null;
    try {
      record = await createLeaveRecord({ teacherId: currentTeacherId, createdBy: 'user-teacher-demo' });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Leave submission failed.');
    } finally {
      setApiBusy('');
    }
    if (!record) return;
    setToast('Leave request submitted.');
    pushNotification({ eventType: 'leave.applied', title: 'Admin notified', target: `/rostering/leave/${record.id}` });
  }

  async function adminCreateLeave() {
    setAdminError('');
    if (!adminCreateReason.trim()) {
      setAdminError('Enter an admin create reason first.');
      return;
    }
    setApiBusy('Creating leave through API...');
    let record: LeaveRecord | null = null;
    try {
      record = await createLeaveRecord({
        teacherId: adminTeacherId,
        createdBy: 'user-admin-demo',
        adminReason: adminCreateReason.trim()
      });
    } catch (caught) {
      setAdminError(caught instanceof Error ? caught.message : 'Admin-created leave failed.');
    } finally {
      setApiBusy('');
    }
    if (!record) return;
    setToast('Admin-created leave recorded.');
    pushNotification({ eventType: 'leave.applied', title: 'Teacher and admin notified', target: `/rostering/leave/${record.id}` });
  }

  function replaceSelected(mutator: (record: LeaveRecord) => LeaveRecord) {
    if (!selectedLeave) return;
    setRecords((current) => current.map((record) => (record.id === selectedLeave.id ? mutator(record) : record)));
  }

  function requireAdjustmentReason(): boolean {
    if (adjustmentReason.trim()) return true;
    setAdminError('Enter an adjustment reason first.');
    return false;
  }

  async function loadRecommendations(impact: LeaveSessionImpact, options: { retry?: boolean } = {}) {
    if (!selectedLeave || !impact.coverageRequired || impact.status !== 'active') return;
    const key = impact.id;
    setRecommendationsByImpact((current) => ({
      ...current,
      [key]: {
        status: 'running',
        progress: 0,
        currentStep: options.retry ? 'retrying' : 'starting',
        recommendations: [],
        reasonCodes: []
      }
    }));
    if (!recommendationApi) {
      window.setTimeout(() => {
        setRecommendationsByImpact((current) => ({
          ...current,
          [key]: recommendationStateFromCompleted({
            recommendations: demoRecommendations(teachers, selectedLeave.teacherId),
            reasonCodes: ['DEMO_RECOMMENDATIONS']
          })
        }));
      }, 0);
      return;
    }
    try {
      const started = await recommendationApi.recommend({ leaveId: selectedLeave.id, sessionId: impact.classSessionId, asyncMode: true });
      if (started.status === 'completed') {
        setRecommendationsByImpact((current) => ({
          ...current,
          [key]: recommendationStateFromCompleted({
            recommendations: started.recommendations,
            reasonCodes: started.reason_codes,
            jobId: started.job_id
          })
        }));
        return;
      }
      setRecommendationsByImpact((current) => ({
        ...current,
        [key]: {
          status: 'running',
          jobId: started.job_id,
          progress: started.progress,
          currentStep: started.current_step,
          recommendations: [],
          reasonCodes: started.reason_codes
        }
      }));
      const polled = await recommendationApi.getJob(started.job_id);
      if (polled.job.status === 'completed' && polled.job.result) {
        setRecommendationsByImpact((current) => ({
          ...current,
          [key]: recommendationStateFromCompleted({
            recommendations: polled.job.result?.recommendations ?? [],
            reasonCodes: polled.job.result?.reason_codes ?? [],
            jobId: polled.job.job_id
          })
        }));
        return;
      }
      setRecommendationsByImpact((current) => ({
        ...current,
        [key]: {
          status: polled.job.status === 'failed' ? 'failed' : 'running',
          jobId: polled.job.job_id,
          progress: polled.job.progress,
          currentStep: polled.job.current_step,
          recommendations: polled.job.result?.recommendations ?? [],
          reasonCodes: polled.job.result?.reason_codes ?? [],
          error: polled.job.error
        }
      }));
    } catch (caught) {
      setRecommendationsByImpact((current) => ({
        ...current,
        [key]: {
          status: 'failed',
          progress: 0,
          recommendations: [],
          reasonCodes: [],
          error: caught instanceof Error ? caught.message : 'Recommendation failed.'
        }
      }));
    }
  }

  function selectRecommendation(impactId: string, recommendation: SubstituteRecommendation) {
    setRecommendationsByImpact((current) => ({
      ...current,
      [impactId]: {
        ...(current[impactId] ?? { status: 'completed', progress: 1, recommendations: [], reasonCodes: [] }),
        selectedTeacherId: recommendation.teacher_id,
        manualOverride: undefined
      }
    }));
    setToast(`${recommendation.teacher_name} selected for coverage.`);
  }

  function selectManualOverride(impact: LeaveSessionImpact, teacher: TeacherOption, availabilityLabel: string) {
    setRecommendationsByImpact((current) => ({
      ...current,
      [impact.id]: {
        ...(current[impact.id] ?? { status: 'completed', progress: 1, recommendations: [], reasonCodes: [] }),
        selectedTeacherId: teacher.id,
        manualOverride: {
          teacherId: teacher.id,
          teacherName: teacher.name,
          availabilityLabel,
          confirmedAt: new Date().toISOString()
        }
      }
    }));
    setToast(`${teacher.name} manually selected for coverage.`);
    pushNotification({
      eventType: 'substitute.override.selected',
      title: `Manual override audited for ${teacher.name}`,
      target: `/rostering/leave/${selectedLeave?.id ?? 'draft'}/impacts/${impact.id}`
    });
  }

  async function confirmSubstituteOffer(impact: LeaveSessionImpact) {
    if (!selectedLeave) return;
    const state = recommendationsByImpact[impact.id];
    const substituteTeacherId = state?.selectedTeacherId;
    if (!substituteTeacherId) return;
    const selectedRecommendation = state?.recommendations.find((recommendation) => recommendation.teacher_id === substituteTeacherId);
    const selectedTeacherName = selectedRecommendation?.teacher_name ?? state?.manualOverride?.teacherName ?? teachers.find((teacher) => teacher.id === substituteTeacherId)?.name ?? substituteTeacherId;
    setRecommendationsByImpact((current) => ({
      ...current,
      [impact.id]: {
        ...(current[impact.id] ?? { status: 'completed', progress: 1, recommendations: [], reasonCodes: [] }),
        offerStatus: 'sending',
        offerError: undefined
      }
    }));
    try {
      if (recommendationApi) {
        await recommendationApi.createOffer({
          leaveId: selectedLeave.id,
          sessionId: impact.classSessionId,
          substituteTeacherId
        });
      }
      replaceSelected((record) => ({
        ...record,
        impacts: record.impacts.map((item) =>
          item.id === impact.id ? { ...item, coverageStatus: 'assigned', updatedAt: new Date().toISOString() } : item
        )
      }));
      setRecommendationsByImpact((current) => ({
        ...current,
        [impact.id]: {
          ...(current[impact.id] ?? { status: 'completed', progress: 1, recommendations: [], reasonCodes: [] }),
          selectedTeacherId: substituteTeacherId,
          offerStatus: 'offered',
          offerError: undefined
        }
      }));
      setToast(`Substitute offer sent to ${selectedTeacherName}.`);
      pushNotification({
        eventType: 'substitute.offered',
        title: `Substitute offer sent to ${selectedTeacherName}`,
        target: `/rostering/leave/${selectedLeave.id}/impacts/${impact.id}`
      });
    } catch (caught) {
      setRecommendationsByImpact((current) => ({
        ...current,
        [impact.id]: {
          ...(current[impact.id] ?? { status: 'completed', progress: 1, recommendations: [], reasonCodes: [] }),
          offerStatus: 'failed',
          offerError: caught instanceof Error ? caught.message : 'Substitute offer failed.'
        }
      }));
    }
  }

  async function toggleCoverage(impactId: string, coverageRequired: boolean) {
    if (!requireAdjustmentReason()) return;
    setAdminError('');
    if (api && selectedLeave) {
      try {
        setApiBusy('Updating impact through API...');
        const result = await api.adjustImpacts({
          leaveRequestId: selectedLeave.id,
          adjustmentReason: adjustmentReason.trim(),
          updateCoverage: [{ impactId, coverageRequired }]
        });
        replaceSelected((record) => ({ ...record, impacts: result.impacts }));
        setToast('Impact coverage updated.');
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Impact coverage update failed.');
      } finally {
        setApiBusy('');
      }
      return;
    }
    replaceSelected((record) => ({
      ...record,
      impacts: record.impacts.map((impact) =>
        impact.id === impactId
          ? {
              ...impact,
              coverageRequired,
              coverageStatus: coverageRequired ? 'unfilled' : 'no_coverage_needed',
              adminAdjustmentReason: adjustmentReason.trim(),
              adjustedBy: 'admin-demo',
              adjustedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : impact
      )
    }));
    setToast('Impact coverage updated.');
  }

  async function removeImpact(impactId: string) {
    if (!requireAdjustmentReason()) return;
    setAdminError('');
    if (api && selectedLeave) {
      try {
        setApiBusy('Removing impact through API...');
        const result = await api.adjustImpacts({
          leaveRequestId: selectedLeave.id,
          adjustmentReason: adjustmentReason.trim(),
          removeImpactIds: [impactId]
        });
        replaceSelected((record) => ({ ...record, impacts: result.impacts }));
        setToast('Impact removed.');
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Impact removal failed.');
      } finally {
        setApiBusy('');
      }
      return;
    }
    replaceSelected((record) => ({
      ...record,
      impacts: record.impacts.map((impact) =>
        impact.id === impactId
          ? {
              ...impact,
              status: 'inactive',
              source: 'admin_removed',
              coverageStatus: 'cancelled',
              adminAdjustmentReason: adjustmentReason.trim(),
              adjustedBy: 'admin-demo',
              adjustedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : impact
      )
    }));
    setToast('Impact removed.');
  }

  async function addImpact() {
    if (!selectedLeave || !sessionToAdd) return;
    if (!requireAdjustmentReason()) return;
    const session = activeSessions.find((item) => item.id === sessionToAdd);
    if (!session) return;
    const now = new Date().toISOString();
    setAdminError('');
    if (api) {
      try {
        setApiBusy('Adding impact through API...');
        const result = await api.adjustImpacts({
          leaveRequestId: selectedLeave.id,
          adjustmentReason: adjustmentReason.trim(),
          add: [{ classSessionId: session.id, impactDate: selectedLeave.startDate, coverageRequired: true }]
        });
        replaceSelected((record) => ({ ...record, impacts: result.impacts }));
        setSessionToAdd('');
        setToast('Impact added.');
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Impact add failed.');
      } finally {
        setApiBusy('');
      }
      return;
    }
    replaceSelected((record) => ({
      ...record,
      impacts: [
        ...record.impacts,
        {
          id: `${record.id}-admin-impact-${record.impacts.length + 1}`,
          schoolId: record.schoolId,
          leaveRequestId: record.id,
          classSessionId: session.id,
          impactDate: record.startDate,
          coverageRequired: true,
          coverageStatus: 'unfilled',
          status: 'active',
          source: 'admin_added',
          warningCodes: [],
          adminAdjustmentReason: adjustmentReason.trim(),
          adjustedBy: 'admin-demo',
          adjustedAt: now,
          createdAt: now,
          updatedAt: now
        }
      ]
    }));
    setSessionToAdd('');
    setToast('Impact added.');
  }

  async function decide(status: Extract<LeaveRequestStatus, 'approved' | 'rejected'>) {
    if (!selectedLeave || selectedLeave.status !== 'pending') return;
    const now = new Date().toISOString();
    if (api) {
      try {
        setApiBusy(status === 'approved' ? 'Approving leave through API...' : 'Rejecting leave through API...');
        const result = status === 'approved' ? await api.approveLeave(selectedLeave.id) : await api.rejectLeave(selectedLeave.id);
        const impacts = status === 'rejected' ? (await api.getImpacts(selectedLeave.id, 'school_admin')).impacts : selectedLeave.impacts;
        replaceSelected((record) => ({ ...record, ...result.leaveRequest, impacts }));
        setToast(status === 'approved' ? 'Leave approved.' : 'Leave rejected.');
        pushNotification({
          eventType: status === 'approved' ? 'leave.approved' : 'leave.rejected',
          title: status === 'approved' ? 'Teacher notified: approved' : 'Teacher notified: rejected',
          target: `/rostering/leave/${selectedLeave.id}`
        });
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Leave decision failed.');
      } finally {
        setApiBusy('');
      }
      return;
    }
    replaceSelected((record) => ({
      ...record,
      status,
      reviewedAt: now,
      impacts: status === 'rejected'
        ? record.impacts.map((impact) => ({ ...impact, status: 'inactive', coverageStatus: 'cancelled', updatedAt: now }))
        : record.impacts
    }));
    setToast(status === 'approved' ? 'Leave approved.' : 'Leave rejected.');
    pushNotification({
      eventType: status === 'approved' ? 'leave.approved' : 'leave.rejected',
      title: status === 'approved' ? 'Teacher notified: approved' : 'Teacher notified: rejected',
      target: `/rostering/leave/${selectedLeave.id}`
    });
  }

  return (
    <section className="leave-workspace" id="leave" aria-label="Leave management workspace">
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {apiBusy ? <div className="toast" role="status">{apiBusy}</div> : null}
      <div className="leave-grid">
        <section className="panel-card leave-form-card" aria-label="Teacher leave application">
          <div className="section-title-row">
            <div>
              <p className="section-kicker">Teacher</p>
              <h2>Apply Leave</h2>
            </div>
            <span className="status-chip">{currentTeacher?.name ?? currentTeacherId}</span>
          </div>
          {!schedulePublished ? <div className="inline-warning">Preview uses current working sessions until the schedule is published.</div> : null}
          {formError ? <div className="inline-error" role="alert">{formError}</div> : null}
          <div className="form-grid two-col">
            <label>
              Start date
              <input aria-label="Leave start date" type="date" value={draft.startDate} onChange={(event) => updateDraft('startDate', event.target.value)} />
            </label>
            <label>
              End date
              <input aria-label="Leave end date" type="date" value={draft.endDate} onChange={(event) => updateDraft('endDate', event.target.value)} />
            </label>
            <label>
              Duration
              <select aria-label="Leave duration" value={draft.durationType} onChange={(event) => updateDraft('durationType', event.target.value as LeaveDurationType)}>
                <option value="full_day">Full day</option>
                <option value="am_half_day">AM half day</option>
                <option value="pm_half_day">PM half day</option>
              </select>
            </label>
            <label>
              Leave type
              <select aria-label="Leave type" value={draft.leaveType} onChange={(event) => updateDraft('leaveType', event.target.value)}>
                <option value="sick">Sick</option>
                <option value="appointment">Appointment</option>
                <option value="personal">Personal</option>
                <option value="training">Training</option>
              </select>
            </label>
          </div>
          <label className="check-row">
            <input aria-label="Coverage needed" type="checkbox" checked={draft.coverageRequired} onChange={(event) => updateDraft('coverageRequired', event.target.checked)} />
            Coverage needed
          </label>
          <label>
            Reason
            <textarea aria-label="Leave reason" rows={3} value={draft.reason} onChange={(event) => updateDraft('reason', event.target.value)} />
          </label>
          <label>
            Substitute notes
            <textarea aria-label="Substitute notes" rows={2} value={draft.substituteNotes} onChange={(event) => updateDraft('substituteNotes', event.target.value)} />
          </label>
          <div className="impact-preview" aria-label="Impacted sessions preview">
            <div className="section-title-row compact">
              <h3>Impacted Sessions</h3>
              <span className="status-chip">{preview.length}</span>
            </div>
            {preview.length ? (
              <ul className="compact-list">
                {preview.map((item) => (
                  <li key={`${item.impactDate}-${item.session.id}`}>{item.impactDate} · {sessionLabel(item.session, item.period, rooms)}</li>
                ))}
              </ul>
            ) : (
              <p className="empty-note">No matching sessions.</p>
            )}
          </div>
          <button className="primary-action" type="button" onClick={() => void submitLeave()} disabled={Boolean(apiBusy)}>Submit leave request</button>
        </section>

        <section className="panel-card" aria-label="Admin leave management">
          <div className="section-title-row">
            <div>
              <p className="section-kicker">Admin</p>
              <h2>Leave Queue</h2>
            </div>
            <span className="status-chip">{records.length} requests</span>
          </div>
          <div className="admin-create-box" aria-label="Admin create leave">
            <label>
              Create for teacher
              <select aria-label="Admin create teacher" value={adminTeacherId} onChange={(event) => setAdminTeacherId(event.target.value)}>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                ))}
              </select>
            </label>
            <label>
              Create reason
              <input aria-label="Admin create reason" value={adminCreateReason} onChange={(event) => setAdminCreateReason(event.target.value)} placeholder="Required for admin-created leave" />
            </label>
            <button type="button" onClick={() => void adminCreateLeave()} disabled={Boolean(apiBusy)}>Create leave as admin</button>
          </div>
          {records.length ? (
            <div className="leave-admin-layout">
              <label>
                Request
                <select aria-label="Leave request" value={selectedLeave?.id ?? ''} onChange={(event) => setSelectedLeaveId(event.target.value)}>
                  {records.map((record) => (
                    <option key={record.id} value={record.id}>{record.startDate} · {durationLabel(record.durationType)} · {statusLabel(record.status)}</option>
                  ))}
                </select>
              </label>
              {selectedLeave ? (
                <div className="leave-detail-panel">
                  <div className="detail-strip">
                    <span>{durationLabel(selectedLeave.durationType)}</span>
                    <span>{selectedLeave.startDate} to {selectedLeave.endDate}</span>
                    <span className={`status-dot status-${selectedLeave.status}`}>{statusLabel(selectedLeave.status)}</span>
                  </div>
                  <label>
                    Adjustment reason
                    <input aria-label="Adjustment reason" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Required before changing impacts" />
                  </label>
                  {adminError ? <div className="inline-error" role="alert">{adminError}</div> : null}
                  <ul className="impact-list" aria-label="Admin impacted sessions">
                    {selectedLeave.impacts.map((impact) => {
                      const session = activeSessions.find((item) => item.id === impact.classSessionId);
                      const period = session ? periodsById.get(session.timetablePeriodId) : undefined;
                      return (
                        <li key={impact.id} className={impact.status === 'inactive' ? 'muted-impact' : ''}>
                          <div>
                            <strong>{impact.impactDate}</strong>
                            <span>{session ? sessionLabel(session, period, rooms) : impact.classSessionId}</span>
                            <small>{coverageLabel(impact.coverageStatus)} · {impact.source}</small>
                          </div>
                          <div className="impact-actions">
                            <label className="check-row slim">
                              <input
                                aria-label={`Coverage required for ${impact.classSessionId}`}
                                type="checkbox"
                                checked={impact.coverageRequired}
                                disabled={selectedLeave.status !== 'pending' || impact.status === 'inactive'}
                                onChange={(event) => void toggleCoverage(impact.id, event.target.checked)}
                              />
                              Cover
                            </label>
                            <button type="button" disabled={selectedLeave.status !== 'pending' || impact.status === 'inactive'} onClick={() => void removeImpact(impact.id)}>Remove</button>
                          </div>
                          {impact.coverageRequired && impact.status === 'active' ? (
                            <RecommendationPanel
                              impact={impact}
                              state={recommendationsByImpact[impact.id]}
                              onLoad={() => void loadRecommendations(impact)}
                              onRetry={() => void loadRecommendations(impact, { retry: true })}
                              onSelect={(recommendation) => selectRecommendation(impact.id, recommendation)}
                              teachers={teachers}
                              sessions={activeSessions}
                              originalTeacherId={selectedLeave.teacherId}
                              onManualSelect={(teacher, availabilityLabel) => selectManualOverride(impact, teacher, availabilityLabel)}
                              onConfirmOffer={() => void confirmSubstituteOffer(impact)}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="add-impact-row">
                    <select aria-label="Add impacted session" value={sessionToAdd} onChange={(event) => setSessionToAdd(event.target.value)} disabled={selectedLeave.status !== 'pending'}>
                      <option value="">Add impacted session</option>
                      {sessionsAvailableToAdd.map((session) => (
                        <option key={session.id} value={session.id}>{sessionLabel(session, periodsById.get(session.timetablePeriodId), rooms)}</option>
                      ))}
                    </select>
                    <button type="button" disabled={!sessionToAdd || selectedLeave.status !== 'pending'} onClick={() => void addImpact()}>Add</button>
                  </div>
                  <div className="decision-actions">
                    <button type="button" disabled={selectedLeave.status !== 'pending'} onClick={() => void decide('approved')}>Approve</button>
                    <button type="button" disabled={selectedLeave.status !== 'pending'} onClick={() => void decide('rejected')}>Reject</button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="empty-note">No leave requests.</p>
          )}
        </section>
      </div>

      <div className="leave-bottom-grid">
        <section className="panel-card" aria-label="Teacher leave status">
          <div className="section-title-row">
            <div>
              <p className="section-kicker">Teacher</p>
              <h2>My Leave</h2>
            </div>
          </div>
          {records.length ? (
            <div className="status-table">
              {records.map((record) => (
                <article key={record.id} className="status-row">
                  <div>
                    <strong>{record.startDate} to {record.endDate}</strong>
                    <span>{durationLabel(record.durationType)} · {record.leaveType} · {record.createdBy === 'user-admin-demo' ? 'Created by admin' : 'Submitted by teacher'}</span>
                  </div>
                  <span className={`status-dot status-${record.status}`}>{statusLabel(record.status)}</span>
                  <small>{record.impacts.filter((impact) => impact.status === 'active').length} active impacts</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No leave history.</p>
          )}
        </section>

        <section className="panel-card" aria-label="Notification log">
          <div className="section-title-row">
            <div>
              <p className="section-kicker">Mock Notifications</p>
              <h2>Notification Log</h2>
            </div>
          </div>
          {notifications.length ? (
            <ul className="compact-list">
              {notifications.map((notification) => (
                <li key={notification.id}>{notification.title} · <span>{notification.eventType}</span> · {notification.target}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">No notifications yet.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function RecommendationPanel({
  impact,
  state,
  onLoad,
  onRetry,
  onSelect,
  onManualSelect,
  onConfirmOffer,
  teachers,
  sessions,
  originalTeacherId
}: {
  impact: LeaveSessionImpact;
  state?: RecommendationPanelState;
  onLoad: () => void;
  onRetry: () => void;
  onSelect: (recommendation: SubstituteRecommendation) => void;
  onManualSelect: (teacher: TeacherOption, availabilityLabel: string) => void;
  onConfirmOffer: () => void;
  teachers: TeacherOption[];
  sessions: ClassSession[];
  originalTeacherId: string;
}) {
  const current = state ?? { status: 'idle' as const, progress: 0, recommendations: [], reasonCodes: [] };
  const percent = Math.round((current.progress ?? 0) * 100);
  const [expandedTeacherId, setExpandedTeacherId] = useState<string>('');
  const [manualSearch, setManualSearch] = useState('');
  const [pendingManualTeacherId, setPendingManualTeacherId] = useState('');
  const currentSession = sessions.find((session) => session.id === impact.classSessionId);
  const recommendedTeacherIds = new Set(current.recommendations.map((recommendation) => recommendation.teacher_id));
  const matchingTeachers = teachers
    .filter((teacher) => `${teacher.name} ${teacher.id}`.toLowerCase().includes(manualSearch.trim().toLowerCase()))
    .slice(0, 8);
  const pendingManualTeacher = teachers.find((teacher) => teacher.id === pendingManualTeacherId);
  const pendingManualStatus = pendingManualTeacher ? manualTeacherStatus(pendingManualTeacher, currentSession, sessions, originalTeacherId, recommendedTeacherIds) : undefined;
  return (
    <section className="recommendation-panel" aria-label={`Substitute recommendations for ${impact.classSessionId}`}>
      <div className="recommendation-panel-head">
        <div>
          <strong>Substitute recommendations</strong>
          <span>{current.status === 'idle' ? 'Not calculated' : `${current.status} · ${current.currentStep ?? 'ready'}`}</span>
        </div>
        {current.status === 'idle' ? (
          <button type="button" onClick={onLoad}>Get recommendations</button>
        ) : (
          <button type="button" onClick={onRetry}>Retry</button>
        )}
      </div>
      {current.status === 'running' ? (
        <div className="recommendation-progress" role="status" aria-label="Recommendation calculation status">
          <span style={{ width: `${Math.max(5, percent)}%` }} />
          <strong>{percent}%</strong>
        </div>
      ) : null}
      {current.status === 'failed' ? (
        <div className="inline-error" role="alert">
          {current.error ?? 'Recommendation failed.'}
          <div className="recommendation-fallbacks">
            <button type="button" onClick={onRetry}>Retry recommendation</button>
            <button type="button">Manual assignment</button>
            <button type="button">Mark unfilled</button>
          </div>
        </div>
      ) : null}
      {current.status === 'completed' && !current.recommendations.length ? (
        <div className="inline-warning">
          No available teachers.
          <div className="recommendation-fallbacks">
            <button type="button">Manual assignment</button>
            <button type="button">Mark unfilled</button>
          </div>
        </div>
      ) : null}
      {current.recommendations.length ? (
        <ol className="recommendation-list" aria-label="Ranked substitute candidates">
          {current.recommendations.map((recommendation) => (
            <li key={recommendation.teacher_id} className={current.selectedTeacherId === recommendation.teacher_id ? 'selected-recommendation' : ''}>
              <div className="recommendation-summary">
                <div>
                  <strong>#{recommendation.rank} {recommendation.teacher_name}</strong>
                  <span>{Math.round(recommendation.composite_score * 100)}% match</span>
                  <small>{recommendation.reason_codes.slice(0, 2).join(' · ') || 'Eligible'}</small>
                </div>
                <button
                  type="button"
                  className="link-button"
                  aria-expanded={expandedTeacherId === recommendation.teacher_id}
                  onClick={() => setExpandedTeacherId((currentId) => (currentId === recommendation.teacher_id ? '' : recommendation.teacher_id))}
                >
                  {expandedTeacherId === recommendation.teacher_id ? 'Hide breakdown' : 'View breakdown'}
                </button>
              </div>
              <button type="button" onClick={() => onSelect(recommendation)}>
                {current.selectedTeacherId === recommendation.teacher_id ? 'Selected' : 'Select'}
              </button>
              {expandedTeacherId === recommendation.teacher_id ? <RecommendationScoreBreakdown recommendation={recommendation} /> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {current.status === 'running' ? (
        <div className="recommendation-fallbacks">
          <button type="button">Manual assignment</button>
          <button type="button">Mark unfilled</button>
        </div>
      ) : null}
      <div className="manual-override-box" aria-label={`Manual override search for ${impact.classSessionId}`}>
        <div className="manual-override-head">
          <strong>Manual override</strong>
          <span>{current.manualOverride ? `Audited override: ${current.manualOverride.teacherName}` : 'Search all school teachers'}</span>
        </div>
        <input
          aria-label="Manual substitute search"
          value={manualSearch}
          onChange={(event) => {
            setManualSearch(event.target.value);
            setPendingManualTeacherId('');
          }}
          placeholder="Search teacher name or ID"
        />
        <ul className="manual-teacher-list" aria-label="Manual substitute options">
          {matchingTeachers.map((teacher) => {
            const status = manualTeacherStatus(teacher, currentSession, sessions, originalTeacherId, recommendedTeacherIds);
            return (
              <li key={teacher.id} className={status.available ? '' : 'manual-unavailable'}>
                <div>
                  <strong>{teacher.name}</strong>
                  <span>{status.label}</span>
                </div>
                <button type="button" onClick={() => setPendingManualTeacherId(teacher.id)}>
                  Choose override
                </button>
              </li>
            );
          })}
        </ul>
      {pendingManualTeacher && pendingManualStatus ? (
        <div className="manual-confirm" role="status">
          <span>Confirm manual override for {pendingManualTeacher.name}. {pendingManualStatus.label}.</span>
          <button type="button" onClick={() => onManualSelect(pendingManualTeacher, pendingManualStatus.label)}>
            Confirm manual override
          </button>
        </div>
      ) : null}
        {current.selectedTeacherId ? (
          <div className="offer-confirm-box" aria-label={`Substitute offer confirmation for ${impact.classSessionId}`}>
            <span>
              {current.offerStatus === 'offered'
                ? 'Offer sent. Coverage is pending substitute response.'
                : 'Confirm to send an offer and notify the substitute teacher.'}
            </span>
            <button type="button" disabled={current.offerStatus === 'sending' || current.offerStatus === 'offered'} onClick={onConfirmOffer}>
              {current.offerStatus === 'sending' ? 'Sending offer...' : current.offerStatus === 'offered' ? 'Offer sent' : 'Send substitute offer'}
            </button>
            {current.offerStatus === 'failed' ? <small role="alert">{current.offerError ?? 'Substitute offer failed.'}</small> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function manualTeacherStatus(
  teacher: TeacherOption,
  currentSession: ClassSession | undefined,
  sessions: ClassSession[],
  originalTeacherId: string,
  recommendedTeacherIds: Set<string>
): { available: boolean; label: string } {
  if (teacher.id === originalTeacherId) {
    return { available: false, label: 'Unavailable - original teacher on leave' };
  }
  if (currentSession) {
    const conflict = sessions.find((session) =>
      session.id !== currentSession.id &&
      session.timetablePeriodId === currentSession.timetablePeriodId &&
      session.assignedTeacherId === teacher.id &&
      session.status !== 'cancelled'
    );
    if (conflict) {
      return { available: false, label: 'Unavailable - teaching another class this period' };
    }
  }
  if (recommendedTeacherIds.has(teacher.id)) {
    return { available: true, label: 'Available - recommended candidate' };
  }
  return { available: true, label: 'Manual override - not in ranked recommendations' };
}

function RecommendationScoreBreakdown({ recommendation }: { recommendation: SubstituteRecommendation }) {
  const criteria = [
    ['Workload balance', recommendation.breakdown.workload_balance],
    ['Subject competency', recommendation.breakdown.subject_competency],
    ['Class familiarity', recommendation.breakdown.class_familiarity],
    ['Recency penalty', recommendation.breakdown.recency_penalty],
    ['Preference policy', recommendation.breakdown.preference_policy]
  ] as const;
  return (
    <div className="recommendation-breakdown" aria-label={`Score breakdown for ${recommendation.teacher_name}`}>
      <div className="recommendation-breakdown-total">
        <strong>Composite score</strong>
        <span>{Math.round(recommendation.composite_score * 100)}%</span>
      </div>
      <div className="recommendation-breakdown-grid">
        {criteria.map(([label, criterion]) => (
          <div key={label} className="recommendation-breakdown-row">
            <div>
              <strong>{label}</strong>
              <small>{criterion.detail}</small>
            </div>
            <span>score {formatScore(criterion.score)}</span>
            <span>weight {formatScore(criterion.weight)}</span>
            <span>adds {formatScore(criterion.contribution)}</span>
          </div>
        ))}
      </div>
      <div className="recommendation-raw-inputs">
        <span>Term load {recommendation.raw_inputs.term_sub_units}</span>
        <span>Week load {recommendation.raw_inputs.week_sub_units}</span>
        <span>Competency {recommendation.raw_inputs.competency_level ?? 'none'}</span>
        <span>Last substitute {recommendation.raw_inputs.days_since_last_sub ?? 'none'} days</span>
      </div>
    </div>
  );
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

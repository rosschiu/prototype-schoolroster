import type {
  ClassSession,
  CreateLeaveRequest,
  LeaveDurationType,
  LeaveRequest,
  LeaveSessionImpact,
  Timetable,
  TimetablePeriod
} from '../../../../../../packages/contracts/src/rostering.js';

export type LeaveApiDraft = {
  teacherId: string;
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  leaveType: string;
  coverageRequired: boolean;
  reason?: string;
  substituteNotes?: string;
  adminCreateReason?: string;
};

export type LeaveApiScheduleSyncInput = {
  sessions: ClassSession[];
  periods: TimetablePeriod[];
};

export type LeaveApi = {
  createTeacherLeave(input: LeaveApiDraft & LeaveApiScheduleSyncInput): Promise<{ leaveRequest: LeaveRequest; impacts: LeaveSessionImpact[] }>;
  createAdminLeave(input: LeaveApiDraft & LeaveApiScheduleSyncInput): Promise<{ leaveRequest: LeaveRequest; impacts: LeaveSessionImpact[] }>;
  adjustImpacts(input: {
    leaveRequestId: string;
    adjustmentReason: string;
    add?: Array<{ classSessionId: string; impactDate: string; coverageRequired?: boolean }>;
    removeImpactIds?: string[];
    updateCoverage?: Array<{ impactId: string; coverageRequired: boolean }>;
  }): Promise<{ impacts: LeaveSessionImpact[] }>;
  approveLeave(leaveRequestId: string): Promise<{ leaveRequest: LeaveRequest }>;
  rejectLeave(leaveRequestId: string): Promise<{ leaveRequest: LeaveRequest }>;
  getImpacts(leaveRequestId: string, role: 'school_admin' | 'teacher'): Promise<{ impacts: LeaveSessionImpact[] }>;
};

type ApiSession = { csrfToken?: string };

type ApiAuth = {
  csrfToken: string;
};

const schoolId = 'school-steck-demo';
const termId = 'term-2026-t1';
const timetableName = `Browser API timetable ${Date.now()}`;

function apiBaseUrl(): string {
  return import.meta.env.VITE_ROSTER_API_URL ?? 'http://127.0.0.1:3001';
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body && body.message ? body.message : `Roster API request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...options.headers
  };
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    credentials: 'include',
    ...options,
    headers
  });
  return parseJson<T>(response);
}

function periodKey(period: Pick<TimetablePeriod, 'dayIndex' | 'periodIndex'>): string {
  return `${period.dayIndex}:${period.periodIndex}`;
}

export function createRosterLeaveApi(): LeaveApi {
  let apiTimetable: Timetable | null = null;
  let apiPeriods: TimetablePeriod[] = [];
  const syncedSessionIds = new Set<string>();

  async function signIn(role: 'school_admin' | 'teacher'): Promise<ApiAuth> {
    const email = role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test';
    const body = await request<{ session: ApiSession }>('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Password123!', requestedRole: role })
    });
    return { csrfToken: body.session.csrfToken ?? '' };
  }

  function canUseExistingBackendSchedule({ sessions, periods }: LeaveApiScheduleSyncInput): boolean {
    if (sessions.length === 0 || periods.length === 0) return false;
    const timetableIds = new Set(sessions.map((session) => session.timetableId));
    if (timetableIds.size !== 1 || timetableIds.has('timetable-demo')) return false;
    const [timetableId] = [...timetableIds];
    return sessions.every((session) => session.status === 'published') &&
      periods.some((period) => period.timetableId === timetableId);
  }

  async function ensureApiSchedule({ sessions, periods }: LeaveApiScheduleSyncInput): Promise<void> {
    if (canUseExistingBackendSchedule({ sessions, periods })) {
      return;
    }
    const auth = await signIn('school_admin');
    if (!apiTimetable) {
      const created = await request<{ timetable: Timetable; periods: TimetablePeriod[] }>('/api/roster/timetables', {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify({ schoolId, termId, name: timetableName })
      });
      apiTimetable = created.timetable;
      apiPeriods = created.periods;
    }

    const apiPeriodByKey = new Map(apiPeriods.map((period) => [periodKey(period), period]));
    const localPeriodById = new Map(periods.map((period) => [period.id, period]));
    for (const session of sessions.filter((item) => item.status !== 'cancelled')) {
      if (syncedSessionIds.has(session.id)) continue;
      const localPeriod = localPeriodById.get(session.timetablePeriodId);
      const apiPeriod = localPeriod ? apiPeriodByKey.get(periodKey(localPeriod)) : undefined;
      if (!apiPeriod || !apiTimetable) continue;
      await request<{ session: ClassSession }>('/api/roster/sessions', {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify({
          id: session.id,
          schoolId,
          termId,
          timetableId: apiTimetable.id,
          timetablePeriodId: apiPeriod.id,
          subjectId: session.subjectId,
          gradeLevelId: session.gradeLevelId,
          section: session.section,
          roomId: session.roomId,
          assignedTeacherId: session.assignedTeacherId,
          equipmentResourceIds: session.equipmentResourceIds,
          status: 'published',
          notes: session.notes
        })
      });
      syncedSessionIds.add(session.id);
    }
  }

  async function createLeave(role: 'school_admin' | 'teacher', input: LeaveApiDraft & LeaveApiScheduleSyncInput) {
    await ensureApiSchedule(input);
    const auth = await signIn(role);
    const payload: CreateLeaveRequest & { adminCreateReason?: string } = {
      schoolId,
      termId,
      teacherId: input.teacherId,
      startDate: input.startDate,
      endDate: input.endDate,
      durationType: input.durationType,
      leaveType: input.leaveType,
      coverageRequired: input.coverageRequired,
      reason: input.reason,
      substituteNotes: input.substituteNotes,
      adminCreateReason: input.adminCreateReason
    };
    return request<{ leaveRequest: LeaveRequest; impacts: LeaveSessionImpact[] }>('/api/roster/leave', {
      method: 'POST',
      headers: { 'x-schoolroster-csrf': auth.csrfToken },
      body: JSON.stringify(payload)
    });
  }

  return {
    createTeacherLeave(input) {
      return createLeave('teacher', input);
    },
    createAdminLeave(input) {
      return createLeave('school_admin', input);
    },
    async adjustImpacts(input) {
      const auth = await signIn('school_admin');
      return request<{ impacts: LeaveSessionImpact[] }>(`/api/roster/leave/${input.leaveRequestId}/impacts`, {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify(input)
      });
    },
    async approveLeave(leaveRequestId) {
      const auth = await signIn('school_admin');
      return request<{ leaveRequest: LeaveRequest }>(`/api/roster/leave/${leaveRequestId}/approve`, {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken }
      });
    },
    async rejectLeave(leaveRequestId) {
      const auth = await signIn('school_admin');
      return request<{ leaveRequest: LeaveRequest }>(`/api/roster/leave/${leaveRequestId}/reject`, {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken }
      });
    },
    async getImpacts(leaveRequestId, role) {
      await signIn(role);
      return request<{ impacts: LeaveSessionImpact[] }>(`/api/roster/leave/${leaveRequestId}/impacts`);
    }
  };
}

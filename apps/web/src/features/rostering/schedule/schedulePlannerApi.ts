import type {
  ClassSession,
  CreateClassSessionRequest,
  CreateTimetableResponse,
  Timetable,
  TimetablePeriod,
  UpdateClassSessionRequest
} from '../../../../../../packages/contracts/src/rostering.js';
import { createDefaultTimetable } from './mockRosterData.js';
import type { SessionDraft } from './types.js';

export type SchedulePlannerApi = {
  createDefaultTimetable: () => Promise<{ timetable: Timetable; periods: TimetablePeriod[]; sessions?: ClassSession[] }>;
  createSession: (input: CreateSessionInput) => Promise<ClassSession>;
  updateSession: (input: UpdateSessionInput) => Promise<ClassSession>;
  publishTimetable: (input: { timetable: Timetable }) => Promise<Timetable>;
  unpublishTimetable: (input: { timetable: Timetable }) => Promise<Timetable>;
};

export type CreateSessionInput = {
  timetable: Timetable;
  draft: SessionDraft;
  sessionCount: number;
};

export type UpdateSessionInput = {
  timetable: Timetable;
  draft: SessionDraft;
  existingSession: ClassSession;
};

type ApiSession = { csrfToken?: string };
type TimetableDetailResponse = CreateTimetableResponse & { sessions: ClassSession[] };

const schoolId = 'school-steck-demo';
const termId = 'term-2026-t1';
const defaultTimetableName = '2026 Term 1 working draft';

function timestamp() {
  return new Date().toISOString();
}

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

async function signInAdmin(): Promise<{ csrfToken: string }> {
  const body = await request<{ session: ApiSession }>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@schoolroster.test',
      password: 'Password123!',
      requestedRole: 'school_admin'
    })
  });
  return { csrfToken: body.session.csrfToken ?? '' };
}

export function toCreateClassSessionRequest({
  timetable,
  draft,
  sessionCount
}: CreateSessionInput): CreateClassSessionRequest {
  return {
    id: `session-${sessionCount + 1}`,
    schoolId: timetable.schoolId,
    termId: timetable.termId,
    timetableId: timetable.id,
    timetablePeriodId: draft.timetablePeriodId,
    subjectId: draft.subjectId.trim(),
    gradeLevelId: draft.gradeLevelId.trim().toUpperCase(),
    section: draft.section.trim().toUpperCase(),
    roomId: draft.roomId || undefined,
    assignedTeacherId: draft.assignedTeacherId || undefined,
    equipmentResourceIds: draft.equipmentResourceIds,
    notes: draft.notes.trim() || undefined,
    status: 'draft'
  };
}

export function toUpdateClassSessionRequest({ draft }: Pick<UpdateSessionInput, 'draft'>): UpdateClassSessionRequest {
  return {
    timetablePeriodId: draft.timetablePeriodId,
    subjectId: draft.subjectId.trim(),
    gradeLevelId: draft.gradeLevelId.trim().toUpperCase(),
    section: draft.section.trim().toUpperCase(),
    roomId: draft.roomId || undefined,
    assignedTeacherId: draft.assignedTeacherId || undefined,
    equipmentResourceIds: draft.equipmentResourceIds,
    notes: draft.notes.trim() || undefined
  };
}

export function classSessionFromCreateRequest(request: CreateClassSessionRequest): ClassSession {
  const now = timestamp();
  return {
    id: request.id ?? `session-${crypto.randomUUID()}`,
    schoolId: request.schoolId,
    termId: request.termId,
    timetableId: request.timetableId,
    timetablePeriodId: request.timetablePeriodId,
    subjectId: request.subjectId,
    gradeLevelId: request.gradeLevelId,
    section: request.section,
    roomId: request.roomId,
    assignedTeacherId: request.assignedTeacherId,
    equipmentResourceIds: request.equipmentResourceIds,
    notes: request.notes,
    status: request.status ?? 'draft',
    createdAt: now,
    updatedAt: now
  };
}

export function classSessionFromUpdateRequest(session: ClassSession, patch: UpdateClassSessionRequest): ClassSession {
  return {
    ...session,
    ...patch,
    updatedAt: timestamp()
  };
}

export function createDemoSchedulePlannerApi(): SchedulePlannerApi {
  return {
    async createDefaultTimetable() {
      return createDefaultTimetable();
    },
    async createSession(input) {
      return classSessionFromCreateRequest(toCreateClassSessionRequest(input));
    },
    async updateSession(input) {
      return classSessionFromUpdateRequest(input.existingSession, toUpdateClassSessionRequest(input));
    },
    async publishTimetable({ timetable }) {
      return { ...timetable, status: 'published', publishedAt: timestamp(), updatedAt: timestamp() };
    },
    async unpublishTimetable({ timetable }) {
      return { ...timetable, status: 'draft', publishedAt: undefined, updatedAt: timestamp() };
    }
  };
}

export function createRosterSchedulePlannerApi(): SchedulePlannerApi {
  let cachedTimetable: Timetable | null = null;
  let cachedPeriods: TimetablePeriod[] = [];
  let cachedSessions: ClassSession[] = [];

  async function loadTimetableDetail(timetableId: string): Promise<TimetableDetailResponse> {
    const detail = await request<TimetableDetailResponse>(`/api/roster/timetables/${timetableId}`);
    cachedTimetable = detail.timetable;
    cachedPeriods = detail.periods;
    cachedSessions = detail.sessions;
    return detail;
  }

  return {
    async createDefaultTimetable() {
      const auth = await signInAdmin();
      const listed = await request<{ timetables: Timetable[] }>(
        `/api/roster/timetables?schoolId=${encodeURIComponent(schoolId)}&termId=${encodeURIComponent(termId)}`
      );
      const existing = [...listed.timetables]
        .filter((timetable) => timetable.name === defaultTimetableName && timetable.status !== 'archived')
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (existing) {
        return loadTimetableDetail(existing.id);
      }

      const created = await request<CreateTimetableResponse>('/api/roster/timetables', {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify({ schoolId, termId, name: defaultTimetableName })
      });
      cachedTimetable = created.timetable;
      cachedPeriods = created.periods;
      cachedSessions = [];
      return created;
    },

    async createSession(input) {
      const auth = await signInAdmin();
      const payload = toCreateClassSessionRequest(input);
      delete payload.id;
      const created = await request<{ session: ClassSession }>('/api/roster/sessions', {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify(payload)
      });
      cachedSessions = [...cachedSessions, created.session];
      return created.session;
    },

    async updateSession(input) {
      const auth = await signInAdmin();
      const updated = await request<{ session: ClassSession }>(`/api/roster/sessions/${input.existingSession.id}`, {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify(toUpdateClassSessionRequest(input))
      });
      cachedSessions = cachedSessions.map((session) => (session.id === updated.session.id ? updated.session : session));
      return updated.session;
    },

    async publishTimetable({ timetable }) {
      const auth = await signInAdmin();
      const published = await request<{ timetable: Timetable }>(`/api/roster/timetables/${timetable.id}/publish`, {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken }
      });
      cachedTimetable = published.timetable;
      cachedSessions = cachedSessions.map((session) => ({ ...session, status: 'published' }));
      return published.timetable;
    },

    async unpublishTimetable({ timetable }) {
      const auth = await signInAdmin();
      const unpublished = await request<{ timetable: Timetable }>(`/api/roster/timetables/${timetable.id}/unpublish`, {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken }
      });
      cachedTimetable = unpublished.timetable;
      cachedSessions = cachedSessions.map((session) => ({ ...session, status: 'draft' }));
      return unpublished.timetable;
    }
  };
}

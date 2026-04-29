import type {
  PatchSubstituteAvailabilityRequest,
  SubstituteAvailability,
  SubstituteAvailabilityStatus
} from '../../../../../../packages/contracts/src/rostering.js';

export type AvailabilityPatchRecord = {
  date: string;
  timetablePeriodId?: string;
  availabilityStatus: SubstituteAvailabilityStatus;
  reason?: string;
};

export type AvailabilityApi = {
  listAvailability(input: {
    schoolId: string;
    teacherId: string;
    startDate?: string;
    endDate?: string;
    role?: 'school_admin' | 'teacher';
  }): Promise<{ availability: SubstituteAvailability[] }>;
  patchAvailability(input: {
    schoolId: string;
    teacherId: string;
    records: AvailabilityPatchRecord[];
    role?: 'school_admin' | 'teacher';
  }): Promise<{ availability: SubstituteAvailability[] }>;
};

type ApiSession = { csrfToken?: string };

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

async function signIn(role: 'school_admin' | 'teacher'): Promise<{ csrfToken: string }> {
  const email = role === 'school_admin' ? 'admin@schoolroster.test' : 'teacher@schoolroster.test';
  const body = await request<{ session: ApiSession }>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'Password123!', requestedRole: role })
  });
  return { csrfToken: body.session.csrfToken ?? '' };
}

export function createRosterAvailabilityApi(): AvailabilityApi {
  return {
    async listAvailability({ schoolId, teacherId, startDate, endDate, role = 'teacher' }) {
      await signIn(role);
      const params = new URLSearchParams({ schoolId, teacherId });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return request<{ availability: SubstituteAvailability[] }>(`/api/roster/availability?${params.toString()}`);
    },
    async patchAvailability({ schoolId, teacherId, records, role = 'teacher' }) {
      const auth = await signIn(role);
      const payload: PatchSubstituteAvailabilityRequest = { schoolId, teacherId, records };
      return request<{ availability: SubstituteAvailability[] }>('/api/roster/availability', {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify(payload)
      });
    }
  };
}


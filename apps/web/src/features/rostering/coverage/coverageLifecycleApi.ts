import type { SubstituteAssignment } from '../../../../../../packages/contracts/src/rostering.js';

export type CoverageLifecycleApi = {
  listAssignments(input: { schoolId: string }): Promise<{ assignments: SubstituteAssignment[] }>;
  updateStatus(input: { assignmentId: string; status: 'canceled' | 'completed'; cancellationReason?: string }): Promise<{ assignment: SubstituteAssignment }>;
  reassign(input: { assignmentId: string; substituteTeacherId: string; cancellationReason?: string }): Promise<{ previousAssignment: SubstituteAssignment; assignment: SubstituteAssignment; assignments: SubstituteAssignment[] }>;
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
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });
  return parseJson<T>(response);
}

async function signInAdmin(): Promise<{ csrfToken: string }> {
  const body = await request<{ session: ApiSession }>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@schoolroster.test', password: 'Password123!', requestedRole: 'school_admin' })
  });
  return { csrfToken: body.session.csrfToken ?? '' };
}

export function createRosterCoverageLifecycleApi(): CoverageLifecycleApi {
  return {
    async listAssignments(input) {
      await signInAdmin();
      return request<{ assignments: SubstituteAssignment[] }>(`/api/roster/substitutes?schoolId=${encodeURIComponent(input.schoolId)}`);
    },
    async updateStatus(input) {
      const auth = await signInAdmin();
      return request<{ assignment: SubstituteAssignment }>(`/api/roster/substitutes/${input.assignmentId}/status`, {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify({ status: input.status, cancellationReason: input.cancellationReason })
      });
    },
    async reassign(input) {
      const auth = await signInAdmin();
      return request<{ previousAssignment: SubstituteAssignment; assignment: SubstituteAssignment; assignments: SubstituteAssignment[] }>(`/api/roster/substitutes/${input.assignmentId}/reassign`, {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify({ substituteTeacherId: input.substituteTeacherId, cancellationReason: input.cancellationReason })
      });
    }
  };
}

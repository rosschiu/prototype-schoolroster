import type { SubstituteAssignment } from '../../../../../../packages/contracts/src/rostering.js';

export type SubstituteAssignmentsApi = {
  list(input: { schoolId: string; teacherId: string }): Promise<{ assignments: SubstituteAssignment[] }>;
  respond(input: { assignmentId: string; status: 'accepted' | 'declined'; teacherId: string }): Promise<{ assignment: SubstituteAssignment }>;
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

async function signInTeacher(teacherId: string): Promise<{ csrfToken: string }> {
  const emailByTeacher: Record<string, string> = {
    'teacher-sub-b': 'sub-b@schoolroster.test',
    'teacher-demo': 'teacher@schoolroster.test'
  };
  const body = await request<{ session: ApiSession }>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({
      email: emailByTeacher[teacherId] ?? 'teacher@schoolroster.test',
      password: 'Password123!',
      requestedRole: 'teacher'
    })
  });
  return { csrfToken: body.session.csrfToken ?? '' };
}

export function createRosterSubstituteAssignmentsApi(): SubstituteAssignmentsApi {
  return {
    async list(input) {
      await signInTeacher(input.teacherId);
      return request<{ assignments: SubstituteAssignment[] }>(`/api/roster/substitutes?schoolId=${encodeURIComponent(input.schoolId)}`);
    },
    async respond(input) {
      const auth = await signInTeacher(input.teacherId);
      return request<{ assignment: SubstituteAssignment }>(`/api/roster/substitutes/${input.assignmentId}/status`, {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify({ status: input.status })
      });
    }
  };
}

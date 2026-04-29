import type { UnfilledCoverageQueueItem } from '../../../../../../packages/contracts/src/rostering.js';

export type CoverageApi = {
  listUnfilled(input: { schoolId: string; termId?: string; teacherId?: string; date?: string }): Promise<{ items: UnfilledCoverageQueueItem[] }>;
  markNoCoverageNeeded(input: { leaveRequestId: string; impactId: string; adjustmentReason: string }): Promise<{ items?: UnfilledCoverageQueueItem[] }>;
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

export function createRosterCoverageApi(): CoverageApi {
  return {
    async listUnfilled(input) {
      await signInAdmin();
      const params = new URLSearchParams({ schoolId: input.schoolId });
      if (input.termId) params.set('termId', input.termId);
      if (input.teacherId) params.set('teacherId', input.teacherId);
      if (input.date) params.set('date', input.date);
      return request<{ items: UnfilledCoverageQueueItem[] }>(`/api/roster/coverage/unfilled?${params.toString()}`);
    },
    async markNoCoverageNeeded(input) {
      const auth = await signInAdmin();
      await request(`/api/roster/leave/${input.leaveRequestId}/impacts`, {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify({
          adjustmentReason: input.adjustmentReason,
          updateCoverage: [{ impactId: input.impactId, coverageRequired: false }]
        })
      });
      return {};
    }
  };
}

import type {
  PatchSubstitutePreferenceRulesRequest,
  SubstitutePreferenceRule
} from '../../../../../../packages/contracts/src/rostering.js';

export type PreferenceRulesApi = {
  listPreferenceRules(input: { schoolId: string }): Promise<{ rules: SubstitutePreferenceRule[] }>;
  patchPreferenceRules(input: PatchSubstitutePreferenceRulesRequest): Promise<{ rules: SubstitutePreferenceRule[] }>;
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
  const response = await fetch(`${apiBaseUrl()}${path}`, { credentials: 'include', ...options, headers });
  return parseJson<T>(response);
}

async function signInAdmin(): Promise<{ csrfToken: string }> {
  const body = await request<{ session: ApiSession }>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@schoolroster.test', password: 'Password123!', requestedRole: 'school_admin' })
  });
  return { csrfToken: body.session.csrfToken ?? '' };
}

export function createRosterPreferenceRulesApi(): PreferenceRulesApi {
  return {
    async listPreferenceRules({ schoolId }) {
      await signInAdmin();
      return request<{ rules: SubstitutePreferenceRule[] }>(`/api/roster/preferences?schoolId=${encodeURIComponent(schoolId)}`);
    },
    async patchPreferenceRules(input) {
      const auth = await signInAdmin();
      return request<{ rules: SubstitutePreferenceRule[] }>('/api/roster/preferences', {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify(input)
      });
    }
  };
}


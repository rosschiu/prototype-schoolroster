import type {
  PatchSubstituteRuleConfigRequest,
  SubstituteRuleConfig,
  SubstituteRuleCriteriaKey
} from '../../../../../../packages/contracts/src/rostering.js';

export type RuleConfigApi = {
  listRules(input: { schoolId: string }): Promise<{ rules: SubstituteRuleConfig[] }>;
  patchRules(input: {
    schoolId: string;
    rules: Array<{
      criteriaKey: SubstituteRuleCriteriaKey;
      weight?: number | null;
      enabled: boolean;
      customParams?: Record<string, unknown>;
    }>;
  }): Promise<{ rules: SubstituteRuleConfig[] }>;
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

export function createRosterRuleConfigApi(): RuleConfigApi {
  return {
    async listRules({ schoolId }) {
      await signInAdmin();
      return request<{ rules: SubstituteRuleConfig[] }>(`/api/roster/rules?schoolId=${encodeURIComponent(schoolId)}`);
    },
    async patchRules({ schoolId, rules }) {
      const auth = await signInAdmin();
      const payload: PatchSubstituteRuleConfigRequest = { schoolId, rules };
      return request<{ rules: SubstituteRuleConfig[] }>('/api/roster/rules', {
        method: 'PATCH',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify(payload)
      });
    }
  };
}


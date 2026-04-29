import type {
  SubstituteRecommendation,
  SubstituteAssignment,
  CreateSubstituteAssignmentRequest,
  SubstituteRecommendationJob,
  SubstituteRecommendationStatus
} from '../../../../../../packages/contracts/src/rostering.js';

export type RecommendationResponse = {
  job_id: string;
  status: SubstituteRecommendationStatus;
  current_step: string;
  progress: number;
  recommendations: SubstituteRecommendation[];
  reason_codes: string[];
};

export type SubstituteRecommendationApi = {
  recommend(input: { leaveId: string; sessionId: string; asyncMode?: boolean }): Promise<RecommendationResponse>;
  getJob(jobId: string): Promise<{ job: SubstituteRecommendationJob }>;
  createOffer(input: CreateSubstituteAssignmentRequest): Promise<{ assignment: SubstituteAssignment; assignments: SubstituteAssignment[] }>;
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
    body: JSON.stringify({
      email: 'admin@schoolroster.test',
      password: 'Password123!',
      requestedRole: 'school_admin'
    })
  });
  return { csrfToken: body.session.csrfToken ?? '' };
}

export function createRosterSubstituteRecommendationApi(): SubstituteRecommendationApi {
  return {
    async recommend(input) {
      await signInAdmin();
      const params = new URLSearchParams({
        leave_id: input.leaveId,
        session_id: input.sessionId
      });
      if (input.asyncMode) params.set('async', 'true');
      return request<RecommendationResponse>(`/api/roster/substitutes/recommend?${params.toString()}`);
    },
    async getJob(jobId) {
      await signInAdmin();
      return request<{ job: SubstituteRecommendationJob }>(`/api/roster/substitutes/recommendations/${jobId}`);
    },
    async createOffer(input) {
      const auth = await signInAdmin();
      return request<{ assignment: SubstituteAssignment; assignments: SubstituteAssignment[] }>('/api/roster/substitutes', {
        method: 'POST',
        headers: { 'x-schoolroster-csrf': auth.csrfToken },
        body: JSON.stringify(input)
      });
    }
  };
}

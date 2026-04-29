import type { CoverageOperationsReport, LeaveSummaryReport, ReportExportType, SubstituteHistoryReport, WorkloadReport } from '../../../../../../packages/contracts/src/rostering.js';

export type ReportsApi = {
  workload(input: { schoolId: string; termId: string }): Promise<{ report: WorkloadReport }>;
  leaveSummary(input: { schoolId: string; termId?: string; startDate?: string; endDate?: string; teacherId?: string }): Promise<{ report: LeaveSummaryReport }>;
  substituteHistory(input: { schoolId: string; termId?: string; startDate?: string; endDate?: string; teacherId?: string }): Promise<{ report: SubstituteHistoryReport }>;
  coverageOperations(input: { schoolId: string; termId?: string; startDate?: string; endDate?: string; teacherId?: string }): Promise<{ report: CoverageOperationsReport }>;
  exportCsv(input: { type: ReportExportType; schoolId: string; termId?: string; startDate?: string; endDate?: string; teacherId?: string }): Promise<string>;
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

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, { credentials: 'include' });
  return parseJson<T>(response);
}

async function requestText(path: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl()}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `Roster API request failed (${response.status}).`);
  }
  return response.text();
}

async function signInAdmin(): Promise<{ csrfToken: string }> {
  const response = await fetch(`${apiBaseUrl()}/api/auth/sign-in`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@schoolroster.test', password: 'Password123!', requestedRole: 'school_admin' })
  });
  const body = await parseJson<{ session: ApiSession }>(response);
  return { csrfToken: body.session.csrfToken ?? '' };
}

function params(input: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value) query.set(key, value);
  return query.toString();
}

export function createRosterReportsApi(): ReportsApi {
  return {
    async workload(input) {
      await signInAdmin();
      return request<{ report: WorkloadReport }>(`/api/roster/reports/workload?${params(input)}`);
    },
    async leaveSummary(input) {
      await signInAdmin();
      return request<{ report: LeaveSummaryReport }>(`/api/roster/reports/leave-summary?${params(input)}`);
    },
    async substituteHistory(input) {
      await signInAdmin();
      return request<{ report: SubstituteHistoryReport }>(`/api/roster/reports/substitute-history?${params(input)}`);
    },
    async coverageOperations(input) {
      await signInAdmin();
      return request<{ report: CoverageOperationsReport }>(`/api/roster/reports/coverage-operations?${params(input)}`);
    },
    async exportCsv(input) {
      await signInAdmin();
      const { type, ...query } = input;
      return requestText(`/api/roster/reports/${type}/export?${params(query)}`);
    }
  };
}

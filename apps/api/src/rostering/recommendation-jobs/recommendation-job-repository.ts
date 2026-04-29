import type { SubstituteRecommendationJob } from '../../../../../packages/contracts/src/rostering.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import { tableRef } from '../db/schema.js';

export type RecommendationJobRepository = {
  get(jobId: string): Promise<SubstituteRecommendationJob | null>;
  upsert(job: SubstituteRecommendationJob): Promise<SubstituteRecommendationJob>;
};

export class InMemoryRecommendationJobRepository implements RecommendationJobRepository {
  private readonly jobs = new Map<string, SubstituteRecommendationJob>();

  async get(jobId: string): Promise<SubstituteRecommendationJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async upsert(job: SubstituteRecommendationJob): Promise<SubstituteRecommendationJob> {
    this.jobs.set(job.job_id, job);
    return job;
  }
}

type RecommendationJobRow = {
  job_id: string;
  status: SubstituteRecommendationJob['status'];
  current_step: string;
  progress: string;
  school_id: string;
  leave_id: string;
  session_id: string;
  result_json: SubstituteRecommendationJob['result'] | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export class PostgresRecommendationJobRepository implements RecommendationJobRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async get(jobId: string): Promise<SubstituteRecommendationJob | null> {
    const result = await this.database.query<RecommendationJobRow>(
      `select job_id, status, current_step, progress::text, school_id, leave_id, session_id, result_json, error, created_at, updated_at
       from ${tableRef(this.schema, 'rostering_recommendation_jobs')}
       where job_id = $1`,
      [jobId]
    );
    return result.rows[0] ? toJob(result.rows[0]) : null;
  }

  async upsert(job: SubstituteRecommendationJob): Promise<SubstituteRecommendationJob> {
    const result = await this.database.query<RecommendationJobRow>(
      `insert into ${tableRef(this.schema, 'rostering_recommendation_jobs')} (
         job_id, status, current_step, progress, school_id, leave_id, session_id, result_json, error, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::timestamptz, $11::timestamptz)
       on conflict (job_id) do update set
         status = excluded.status,
         current_step = excluded.current_step,
         progress = excluded.progress,
         result_json = excluded.result_json,
         error = excluded.error,
         updated_at = excluded.updated_at
       returning job_id, status, current_step, progress::text, school_id, leave_id, session_id, result_json, error, created_at, updated_at`,
      [
        job.job_id,
        job.status,
        job.current_step,
        job.progress,
        job.school_id,
        job.leave_id,
        job.session_id,
        JSON.stringify(job.result ?? null),
        job.error ?? null,
        job.created_at,
        job.updated_at
      ]
    );
    return toJob(result.rows[0]);
  }
}

function toJob(row: RecommendationJobRow): SubstituteRecommendationJob {
  return {
    job_id: row.job_id,
    status: row.status,
    current_step: row.current_step,
    progress: Number(row.progress),
    school_id: row.school_id,
    leave_id: row.leave_id,
    session_id: row.session_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    result: row.result_json ?? undefined,
    error: row.error ?? undefined
  };
}

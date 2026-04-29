import pg from 'pg';

export type DatabaseHealth = {
  check: () => Promise<void>;
  close: () => Promise<void>;
};

export type PostgresDatabase = DatabaseHealth & {
  query: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ) => Promise<pg.QueryResult<TRow>>;
};

export function createPostgresDatabase(databaseUrl: string): PostgresDatabase {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  return {
    query<TRow extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]) {
      return pool.query<TRow>(text, values);
    },
    async check() {
      await pool.query('select 1');
    },
    async close() {
      await pool.end();
    }
  };
}

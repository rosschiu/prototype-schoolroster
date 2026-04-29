export type ApiConfig = {
  host: string;
  port: number;
  databaseUrl?: string;
  databaseSchema: string;
  allowInMemoryRuntime: boolean;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const DEFAULT_DATABASE_SCHEMA = 'draft_edu_v2';
const SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function createApiConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const rawPort = env.PORT ?? env.API_PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);
  const databaseSchema = env.DATABASE_SCHEMA ?? DEFAULT_DATABASE_SCHEMA;

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT/API_PORT must be a positive integer. Received: ${rawPort}`);
  }

  if (!SCHEMA_NAME_PATTERN.test(databaseSchema)) {
    throw new Error(`DATABASE_SCHEMA must match ${SCHEMA_NAME_PATTERN}. Received: ${databaseSchema}`);
  }

  return {
    host: env.HOST ?? env.API_HOST ?? DEFAULT_HOST,
    port,
    databaseUrl: env.DATABASE_URL,
    databaseSchema,
    allowInMemoryRuntime: env.ALLOW_IN_MEMORY_ROSTER_API === 'true'
  };
}

import { buildRosterApiApp, createDefaultRosterApiServices } from './rostering/api/app.js';
import { createApiConfig } from './config.js';
import { createPostgresDatabase } from './db/postgres.js';
import { migrateRosteringDatabase } from './rostering/db/migrations.js';

const config = createApiConfig(process.env);
const database = config.databaseUrl ? createPostgresDatabase(config.databaseUrl) : undefined;

if (!database && !config.allowInMemoryRuntime) {
  throw new Error('DATABASE_URL is required for the roster API runtime. Set ALLOW_IN_MEMORY_ROSTER_API=true only for explicit local/test fallback.');
}

if (database) {
  await database.check();
  await migrateRosteringDatabase(database, config.databaseSchema);
}

const app = buildRosterApiApp(await createDefaultRosterApiServices(
  database ? { database, schema: config.databaseSchema } : undefined
));

app.addHook('onClose', async () => {
  await database?.close();
});

try {
  await app.listen({ host: config.host, port: config.port });
  console.log(`Roster API listening on http://${config.host}:${config.port}`);
} catch (error) {
  app.log.error(error);
  await database?.close();
  process.exit(1);
}

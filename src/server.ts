import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './db/migrate';
import { bootstrapAdmin } from './services/auth.service';
import { cleanExpiredSecurityRecords } from './services/cleanup.service';

async function startServer(): Promise<void> {
  await runMigrations();
  await bootstrapAdmin();
  await cleanExpiredSecurityRecords();
  setInterval(async () => {
    try {
      await cleanExpiredSecurityRecords();
    } catch (error) {
      console.error('Cleanup interval error:', error);
    }
  }, 60 * 60 * 1000).unref();
  createApp().listen(env.port, env.host, () => {
    console.log(`Atlas API listening on http://${env.host}:${env.port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Atlas API failed to start', error);
  process.exitCode = 1;
});

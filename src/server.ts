import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './db/migrate';
import { bootstrapAdmin } from './services/auth.service';
import { cleanExpiredSecurityRecords } from './services/cleanup.service';
import { processPendingEmails } from './services/email/email-queue.service';
import { sendDeadlineReminders } from './services/task-notification.service';

const WORKER_INTERVAL_MS = 60 * 1000;

async function runBackgroundWorker(): Promise<void> {
  try {
    await cleanExpiredSecurityRecords();
    await processPendingEmails();
    await sendDeadlineReminders();
  } catch (error) {
    console.error('Background worker error:', error);
  }
}

async function startServer(): Promise<void> {
  await runMigrations();
  await bootstrapAdmin();
  await runBackgroundWorker();
  setInterval(runBackgroundWorker, WORKER_INTERVAL_MS).unref();
  createApp().listen(env.port, env.host, () => {
    console.log(`Atlas API listening on http://${env.host}:${env.port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Atlas API failed to start', error);
  process.exitCode = 1;
});

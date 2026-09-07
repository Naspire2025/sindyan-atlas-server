import { pool } from '../../db/connection';
import { sendEmail } from './email.service';
import type { EmailMessage } from './email.types';

const PROCESS_BATCH_SIZE = 20;
const STUCK_PROCESSING_AFTER_MS = 5 * 60 * 1000;

export interface QueuedEmail {
  id: string;
  idempotency_key: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  text_body: string;
  html_body: string;
  status: string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  delivered_at: string | null;
  failed_at: string | null;
}

export interface EnqueueEmailInput {
  idempotencyKey: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  text: string;
  html: string;
}

export async function enqueueEmail(input: EnqueueEmailInput): Promise<void> {
  await pool.query(`
    INSERT INTO email_queue (idempotency_key, recipient_email, recipient_name, subject, text_body, html_body)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [input.idempotencyKey, input.recipientEmail, input.recipientName, input.subject, input.text, input.html]);
}

interface ProcessedEmailCounts {
  delivered: number;
  failed: number;
}

function retryBackoffMinutes(retryCount: number): number {
  return Math.min(30, Math.pow(2, retryCount));
}

export async function processPendingEmails(): Promise<ProcessedEmailCounts> {
  await recoverStuckProcessingEmails();

  const result = await pool.query<QueuedEmail>(`
    SELECT * FROM email_queue
    WHERE status = 'pending' AND next_attempt_at <= NOW()
    ORDER BY next_attempt_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `, [PROCESS_BATCH_SIZE]);

  let delivered = 0;
  let failed = 0;

  for (const row of result.rows) {
    await pool.query("UPDATE email_queue SET status = 'processing', updated_at = NOW() WHERE id = $1", [row.id]);

    try {
      const message: EmailMessage = {
        to: row.recipient_email,
        subject: row.subject,
        text: row.text_body,
        html: row.html_body,
      };
      await sendEmail(message);
      await pool.query("UPDATE email_queue SET status = 'delivered', delivered_at = NOW(), updated_at = NOW() WHERE id = $1", [row.id]);
      delivered += 1;
    } catch (error) {
      const attempted = nextAttempt(row, error);
      if (attempted.isFinalAttempt) {
        await markFailed(row.id, attempted.count, attempted.message);
        failed += 1;
      } else {
        await scheduleRetry(row.id, attempted.count, attempted.message);
      }
    }
  }

  return { delivered, failed };
}

async function recoverStuckProcessingEmails(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_PROCESSING_AFTER_MS).toISOString();
  await pool.query(`
    UPDATE email_queue
    SET status = 'pending',
        next_attempt_at = NOW(),
        retry_count = retry_count + 1,
        last_error = COALESCE(NULLIF(last_error, ''), '') || 'Reclaimed after the worker stopped mid-delivery. ',
        updated_at = NOW()
    WHERE status = 'processing' AND updated_at < $1
  `, [cutoff]);
}

interface AttemptResult {
  count: number;
  message: string;
  isFinalAttempt: boolean;
}

function nextAttempt(row: QueuedEmail, error: unknown): AttemptResult {
  const nextCount = row.retry_count + 1;
  return {
    count: nextCount,
    message: error instanceof Error ? error.message : 'Unknown error',
    isFinalAttempt: nextCount >= row.max_retries,
  };
}

async function markFailed(id: string, retryCount: number, errorMessage: string): Promise<void> {
  await pool.query(`
    UPDATE email_queue
    SET status = 'failed', retry_count = $1, last_error = $2, failed_at = NOW(), updated_at = NOW()
    WHERE id = $3
  `, [retryCount, errorMessage, id]);
}

async function scheduleRetry(id: string, retryCount: number, errorMessage: string): Promise<void> {
  await pool.query(`
    UPDATE email_queue
    SET status = 'pending', retry_count = $1, last_error = $2,
        next_attempt_at = NOW() + INTERVAL '1 minute' * $3,
        updated_at = NOW()
    WHERE id = $4
  `, [retryCount, errorMessage, retryBackoffMinutes(retryCount), id]);
}
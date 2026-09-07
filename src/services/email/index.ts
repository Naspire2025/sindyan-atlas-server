export { sendEmail } from './email.service';
export { enqueueEmail, processPendingEmails } from './email-queue.service';
export type { EmailMessage, EmailProvider, EmailResult } from './email.types';
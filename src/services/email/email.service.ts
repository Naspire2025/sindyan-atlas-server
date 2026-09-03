import { env } from '../../config/env';
import { AppError } from '../../utils/app-error.util';
import { EmailMessage, EmailProvider } from './email.types';
import { SmtpProvider } from './providers/smtp.provider';
import { WebhookEmailProvider } from './providers/webhook.provider';

export const smtpProvider: EmailProvider = new SmtpProvider();
export const webhookProvider: EmailProvider = new WebhookEmailProvider();

const PROVIDERS: EmailProvider[] = [smtpProvider, webhookProvider];

export function resolveProvider(
  configured: EmailProvider[],
  requested?: string,
): EmailProvider {
  const normalisedRequested = requested?.trim().toLowerCase();

  if (normalisedRequested) {
    const provider = configured.find((p) => p.name === normalisedRequested);
    if (!provider) throw new AppError(500, `Unknown email provider: ${normalisedRequested}.`);
    return provider;
  }

  if (configured.length === 0) {
    throw new AppError(503, 'Email delivery is not configured.');
  }
  return configured.length > 1 ? smtpProvider : configured[0];
}

function configuredProviders(): EmailProvider[] {
  return PROVIDERS.filter((provider) => provider.isConfigured());
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = resolveProvider(configuredProviders(), env.emailProvider);
  await provider.send(message);
}

export async function sendInvitationEmail(input: {
  email: string;
  name: string;
  invitationUrl: string;
}): Promise<void> {
  await sendEmail({
    to: input.email,
    subject: 'You have been invited to Atlas',
    text: `Hello ${input.name},\n\nYou have been invited to Atlas. Accept your invitation here:\n${input.invitationUrl}\n`,
    html: `<p>Hello ${input.name},</p><p>You have been invited to Atlas. Accept your invitation by clicking below:</p><p><a href="${input.invitationUrl}">Accept invitation</a></p>`,
  });
}
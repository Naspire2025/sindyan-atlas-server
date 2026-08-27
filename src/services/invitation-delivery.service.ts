import { env } from '../config/env';
import { AppError } from '../utils/app-error.util';

export async function deliverInvitation(input: { email: string; name: string; token: string }): Promise<void> {
  if (!env.invitationDeliveryWebhookUrl || !env.frontendAppUrl) {
    throw new AppError(503, 'Invitation delivery is not configured.');
  }

  const response = await fetch(env.invitationDeliveryWebhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to: input.email,
      name: input.name,
      invitationUrl: `${env.frontendAppUrl.replace(/\/$/, '')}/accept-invitation?token=${encodeURIComponent(input.token)}`,
    }),
  });
  if (!response.ok) throw new AppError(502, 'Unable to deliver the invitation.');
}

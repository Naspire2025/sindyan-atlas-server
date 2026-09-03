import { env } from '../config/env';
import { AppError } from '../utils/app-error.util';
import { sendInvitationEmail } from './email/email.service';

export async function deliverInvitation(input: {
  email: string;
  name: string;
  token: string;
}): Promise<void> {
  if (!env.frontendAppUrl) {
    throw new AppError(503, 'Invitation delivery is not configured.');
  }
  const invitationUrl = `${env.frontendAppUrl.replace(/\/$/, '')}/accept-invitation?token=${encodeURIComponent(input.token)}`;
  try {
    await sendInvitationEmail({
      email: input.email,
      name: input.name,
      invitationUrl,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'Unable to deliver the invitation.');
  }
}
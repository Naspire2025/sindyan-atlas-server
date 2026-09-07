import { env } from '../config/env';
import { AppError } from '../utils/app-error.util';
import { sendEmail } from './email/email.service';
import { renderInvitationEmail } from './email/templates/invitation.template';

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
    const email = renderInvitationEmail({
      recipientName: input.name,
      invitationUrl,
    });
    await sendEmail({
      to: input.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'Unable to deliver the invitation.');
  }
}
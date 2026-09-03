import { env } from '../../../config/env';
import { EmailMessage, EmailProvider, EmailResult } from '../email.types';

export class WebhookEmailProvider implements EmailProvider {
  readonly name = 'webhook';

  isConfigured(): boolean {
    return Boolean(env.invitationDeliveryWebhookUrl);
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    if (!env.invitationDeliveryWebhookUrl) {
      throw new Error('Webhook email provider is not configured. Set INVITATION_DELIVERY_WEBHOOK_URL.');
    }
    const to = message.to;
    const recipient = typeof to === 'string' ? to : Array.isArray(to) ? to.map((a) => a.address) : [to.address];
    const response = await fetch(env.invitationDeliveryWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      throw new Error(`Webhook email delivery failed with status ${response.status}.`);
    }
    return { provider: this.name };
  }
}
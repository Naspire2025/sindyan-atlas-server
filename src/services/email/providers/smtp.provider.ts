import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../../config/env';
import { EmailMessage, EmailProvider, EmailResult } from '../email.types';

function buildFromAddress(): string {
  const host = env.smtpFrom || `${env.smtpUser ?? 'noreply'}@${env.smtpHost ?? 'localhost'}`;
  const name = env.smtpFromName;
  if (name) return `"${name}" <${host}>`;
  return host;
}

export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';
  private transporter: Transporter | undefined;

  isConfigured(): boolean {
    return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    if (!this.isConfigured()) {
      throw new Error(
        'SMTP email provider is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.',
      );
    }
    this.transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass ?? '',
      },
    });
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    const transporter = this.getTransporter();
    const to = message.to;
    const recipient =
      typeof to === 'string' ? to : Array.isArray(to) ? to.map((a) => a.address).join(', ') : to.address;

    const result = await transporter.sendMail({
      from: buildFromAddress(),
      to: recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { provider: this.name, messageId: result.messageId };
  }
}
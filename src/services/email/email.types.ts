export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailMessage {
  to: EmailAddress | EmailAddress[] | string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailResult {
  provider: string;
  messageId?: string;
}

export interface EmailSendErrorContext {
  provider: string;
  to: string;
  subject: string;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<EmailResult>;
}
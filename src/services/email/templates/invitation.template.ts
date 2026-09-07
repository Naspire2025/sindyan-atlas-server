import { renderActionButton, renderHtmlLayout, type EmailEnvelope } from './layout';

export function renderInvitationEmail(input: {
  recipientName: string;
  invitationUrl: string;
}): EmailEnvelope {
  const subject = 'You have been invited to Atlas';
  const text = `Hello ${input.recipientName},\n\nYou have been invited to Atlas. Accept your invitation here:\n${input.invitationUrl}\n`;
  const html = renderHtmlLayout({
    heading: 'You are invited to Atlas',
    bodyHtml: `<p>Hello ${input.recipientName},</p><p>You have been invited to join Atlas. Create your account and access your projects by accepting the invitation below.</p>${renderActionButton({ label: 'Accept invitation', url: input.invitationUrl })}`,
  });
  return { subject, text, html };
}
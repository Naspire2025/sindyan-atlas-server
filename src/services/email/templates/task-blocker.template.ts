import { escapeHtml, renderActionButton, renderHtmlLayout, type EmailEnvelope } from './layout';

export function renderTaskBlockerEmail(input: {
  recipientName: string;
  actorName: string;
  projectName: string;
  taskTitle: string;
  taskUrl: string;
  blockerNote: string | null;
}): EmailEnvelope {
  const noteBlock = input.blockerNote
    ? `<p style="padding:12px 16px;background-color:#f3f4f6;border-radius:8px;">${escapeHtml(input.blockerNote).replace(/\n/g, '<br>')}</p>`
    : '';
  const textNote = input.blockerNote ? `\n\nBlocker note: ${input.blockerNote}` : '';
  const subject = `Task blocked: ${input.taskTitle}`;
  const text = `Hello ${input.recipientName},\n\n${input.actorName} blocked the task "${input.taskTitle}" in ${input.projectName}.${textNote}\n\nOpen it here:\n${input.taskUrl}\n`;
  const html = renderHtmlLayout({
    heading: 'Task blocked',
    bodyHtml: `<p>Hello ${input.recipientName},</p><p><strong>${input.actorName}</strong> blocked the task <strong>${input.taskTitle}</strong> in ${input.projectName}.</p>${noteBlock}${renderActionButton({ label: 'Open task', url: input.taskUrl })}`,
  });
  return { subject, text, html };
}
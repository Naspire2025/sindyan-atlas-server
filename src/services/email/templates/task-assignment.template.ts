import { renderActionButton, renderHtmlLayout, type EmailEnvelope } from './layout';

export function renderTaskAssignmentEmail(input: {
  recipientName: string;
  projectName: string;
  taskTitle: string;
  taskUrl: string;
}): EmailEnvelope {
  const subject = `You have been assigned a task in ${input.projectName}`;
  const text = `Hello ${input.recipientName},\n\nYou have been assigned a task in ${input.projectName}: "${input.taskTitle}".\nOpen it here:\n${input.taskUrl}\n`;
  const html = renderHtmlLayout({
    heading: 'New task assigned',
    bodyHtml: `<p>Hello ${input.recipientName},</p><p>You have been assigned a task in <strong>${input.projectName}</strong>:</p><p><strong>${input.taskTitle}</strong></p>${renderActionButton({ label: 'Open task', url: input.taskUrl })}`,
  });
  return { subject, text, html };
}
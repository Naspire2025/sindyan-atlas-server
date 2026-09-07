import { renderActionButton, renderHtmlLayout, type EmailEnvelope } from './layout';
import { formatTaskStatus } from './task-status.util';

export function renderTaskStatusChangeEmail(input: {
  recipientName: string;
  actorName: string;
  projectName: string;
  taskTitle: string;
  status: string;
  taskUrl: string;
}): EmailEnvelope {
  const statusLabel = formatTaskStatus(input.status);
  const subject = `Task is now ${statusLabel.toLowerCase()}: ${input.taskTitle}`;
  const text = `Hello ${input.recipientName},\n\n${input.actorName} moved the task "${input.taskTitle}" in ${input.projectName} to ${statusLabel}.\nOpen it here:\n${input.taskUrl}\n`;
  const html = renderHtmlLayout({
    heading: `Task is now ${statusLabel.toLowerCase()}`,
    bodyHtml: `<p>Hello ${input.recipientName},</p><p><strong>${input.actorName}</strong> moved the task <strong>${input.taskTitle}</strong> in ${input.projectName} to <strong>${statusLabel}</strong>.</p>${renderActionButton({ label: 'Open task', url: input.taskUrl })}`,
  });
  return { subject, text, html };
}
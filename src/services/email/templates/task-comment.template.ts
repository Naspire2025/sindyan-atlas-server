import { escapeHtml, renderActionButton, renderHtmlLayout, type EmailEnvelope } from './layout';

export function renderTaskCommentEmail(input: {
  recipientName: string;
  commenterName: string;
  projectName: string;
  taskTitle: string;
  taskUrl: string;
  commentBody: string;
}): EmailEnvelope {
  const subject = `New comment on task: ${input.taskTitle}`;
  const text = `Hello ${input.recipientName},\n\n${input.commenterName} commented on the task "${input.taskTitle}" in ${input.projectName}:\n\n${input.commentBody}\n\nOpen it here:\n${input.taskUrl}\n`;
  const html = renderHtmlLayout({
    heading: 'New comment on your task',
    bodyHtml: `<p>Hello ${input.recipientName},</p><p><strong>${input.commenterName}</strong> commented on <strong>${input.taskTitle}</strong> in ${input.projectName}:</p><p style="padding:12px 16px;background-color:#f3f4f6;border-radius:8px;">${escapeHtml(input.commentBody).replace(/\n/g, '<br>')}</p>${renderActionButton({ label: 'Open task', url: input.taskUrl })}`,
  });
  return { subject, text, html };
}
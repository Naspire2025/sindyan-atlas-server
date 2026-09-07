import { renderActionButton, renderHtmlLayout, type EmailEnvelope } from './layout';

function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return dueDate;
  return date.toISOString().slice(0, 10);
}

function deadlineStatusWord(isOverdue: boolean): string {
  return isOverdue ? 'overdue' : 'due soon';
}

export function renderTaskDeadlineReminderEmail(input: {
  recipientName: string;
  projectName: string;
  taskTitle: string;
  taskUrl: string;
  dueDate: string;
  isOverdue: boolean;
}): EmailEnvelope {
  const statusWord = deadlineStatusWord(input.isOverdue);
  const dueLabel = formatDueDate(input.dueDate);
  const subject = `Task ${statusWord}: ${input.taskTitle}`;
  const text = `Hello ${input.recipientName},\n\nThe task "${input.taskTitle}" in ${input.projectName} is ${statusWord}. Due date: ${dueLabel}.\nOpen it here:\n${input.taskUrl}\n`;
  const html = renderHtmlLayout({
    heading: `Task ${statusWord}`,
    bodyHtml: `<p>Hello ${input.recipientName},</p><p>The task <strong>${input.taskTitle}</strong> in <strong>${input.projectName}</strong> is <strong>${statusWord}</strong>.</p><p>Due date: <strong>${dueLabel}</strong></p>${renderActionButton({ label: 'Open task', url: input.taskUrl })}`,
  });
  return { subject, text, html };
}
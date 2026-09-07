import { pool } from '../db/connection';
import { findTask, type TaskRow } from '../db/repositories/task.repository';
import { findUserById } from '../db/repositories/user.repository';
import type { AuthenticatedUser } from '../types/auth';
import { env } from '../config/env';
import { enqueueEmail } from './email/email-queue.service';
import { renderTaskAssignmentEmail } from './email/templates/task-assignment.template';
import { renderTaskBlockerEmail } from './email/templates/task-blocker.template';
import { renderTaskCommentEmail } from './email/templates/task-comment.template';
import { renderTaskDeadlineReminderEmail } from './email/templates/task-deadline-reminder.template';
import { renderTaskStatusChangeEmail } from './email/templates/task-status-change.template';

const DEADLINE_REMINDER_WINDOW_DAYS = 1;

async function runNotificationSafely(operationName: string, operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    console.error(`Task notification failed (${operationName}):`, error);
  }
}

function taskUrl(taskId: string): string {
  return `${env.frontendAppUrl?.replace(/\/$/, '') ?? ''}/tasks/${encodeURIComponent(taskId)}`;
}

function isSameUser(userA: AuthenticatedUser, userIdB: string): boolean {
  return userA.id === userIdB;
}

async function findProjectLeads(projectId: string): Promise<AuthenticatedUser[]> {
  const result = await pool.query(`
    SELECT users.id, users.name, users.email_display AS email, users.role, users.status
    FROM project_memberships
    JOIN users ON users.id = project_memberships.user_id
    WHERE project_memberships.project_id = $1
      AND project_memberships.project_role = 'project_lead'
      AND users.status = 'active'
  `, [projectId]);
  return result.rows as AuthenticatedUser[];
}

async function taskRecipients(actor: AuthenticatedUser, task: TaskRow): Promise<AuthenticatedUser[]> {
  const recipients: AuthenticatedUser[] = [];
  const leads = await findProjectLeads(task.project_id);
  recipients.push(...leads.filter((lead) => !isSameUser(lead, actor.id)));

  if (task.assignee_user_id && !isSameUser(actor, task.assignee_user_id)) {
    const assignee = await findUserById(task.assignee_user_id);
    if (assignee) recipients.push(assignee);
  }

  const uniqueRecipients = new Map<string, AuthenticatedUser>();
  for (const recipient of recipients) uniqueRecipients.set(recipient.id, recipient);
  return [...uniqueRecipients.values()];
}

export function sendTaskAssignmentNotification(actor: AuthenticatedUser, task: TaskRow): Promise<void> {
  return runNotificationSafely('assignment', async () => {
    if (!env.frontendAppUrl || !task.assignee_user_id) return;
    if (isSameUser(actor, task.assignee_user_id)) return;

    const assignee = await findUserById(task.assignee_user_id);
    if (!assignee) return;

    const email = renderTaskAssignmentEmail({
      recipientName: assignee.name,
      projectName: String(task.project_name),
      taskTitle: String(task.title),
      taskUrl: taskUrl(task.id),
    });
    await enqueueEmail({
      ...email,
      idempotencyKey: `task-assignment:${task.id}:${task.assignee_user_id}`,
      recipientEmail: assignee.email,
      recipientName: assignee.name,
    });
  });
}

export function sendTaskStatusChangeNotification(
  actor: AuthenticatedUser,
  task: TaskRow,
  previousStatus: string,
  newStatus: string,
): Promise<void> {
  return runNotificationSafely('status change', async () => {
    if (!env.frontendAppUrl || !task.assignee_user_id) return;
    if (previousStatus === newStatus) return;
    if (isSameUser(actor, task.assignee_user_id)) return;

    const assignee = await findUserById(task.assignee_user_id);
    if (!assignee) return;

    const email = renderTaskStatusChangeEmail({
      recipientName: assignee.name,
      actorName: actor.name,
      projectName: String(task.project_name),
      taskTitle: String(task.title),
      status: newStatus,
      taskUrl: taskUrl(task.id),
    });
    await enqueueEmail({
      ...email,
      idempotencyKey: `task-status:${task.id}:${previousStatus}:${newStatus}:${actor.id}`,
      recipientEmail: assignee.email,
      recipientName: assignee.name,
    });
  });
}

export function sendTaskBlockedNotification(actor: AuthenticatedUser, task: TaskRow): Promise<void> {
  return runNotificationSafely('blocked', async () => {
    if (!env.frontendAppUrl || task.status !== 'blocked') return;

    const recipients = await taskRecipients(actor, task);
    for (const recipient of recipients) {
      if (isSameUser(recipient, actor.id)) continue;

      const email = renderTaskBlockerEmail({
        recipientName: recipient.name,
        actorName: actor.name,
        projectName: String(task.project_name),
        taskTitle: String(task.title),
        taskUrl: taskUrl(task.id),
        blockerNote: task.blocker_note ? String(task.blocker_note) : null,
      });
      await enqueueEmail({
        ...email,
        idempotencyKey: `task-blocked:${task.id}:${actor.id}:${recipient.id}`,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
      });
    }
  });
}

export function sendTaskCommentNotification(
  actor: AuthenticatedUser,
  taskId: string,
  commentId: string,
  commentBody: string,
): Promise<void> {
  return runNotificationSafely('comment', async () => {
    if (!env.frontendAppUrl) return;

    const task = await findTask(taskId);
    if (!task) return;

    const recipients = await taskRecipients(actor, task);
    for (const recipient of recipients) {
      if (isSameUser(recipient, actor.id)) continue;

      const email = renderTaskCommentEmail({
        recipientName: recipient.name,
        commenterName: actor.name,
        projectName: String(task.project_name),
        taskTitle: String(task.title),
        taskUrl: taskUrl(task.id),
        commentBody,
      });
      await enqueueEmail({
        ...email,
        idempotencyKey: `task-comment:${commentId}:${recipient.id}`,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
      });
    }
  });
}

interface DeadlineTaskRow {
  id: string;
  title: string;
  due_date: string;
  project_name: string;
  assignee_user_id: string;
  assignee_name: string;
  assignee_email: string;
}

export async function sendDeadlineReminders(): Promise<number> {
  if (!env.frontendAppUrl) return 0;

  const result = await pool.query<DeadlineTaskRow>(`
    SELECT tasks.id, tasks.title, tasks.due_date,
      projects.name AS project_name, users.id AS assignee_user_id,
      users.name AS assignee_name, users.email_display AS assignee_email
    FROM tasks
    JOIN projects ON projects.id = tasks.project_id
    JOIN users ON users.id = tasks.assignee_user_id
    WHERE tasks.due_date IS NOT NULL
      AND tasks.status NOT IN ('done', 'reviewed')
      AND tasks.deadline_reminder_sent = FALSE
      AND tasks.due_date <= (CURRENT_DATE + $1::INTEGER)::TEXT
  `, [DEADLINE_REMINDER_WINDOW_DAYS]);

  let remindersSent = 0;

  for (const task of result.rows) {
    const isOverdue = Date.parse(task.due_date) < Date.now();
    const email = renderTaskDeadlineReminderEmail({
      recipientName: task.assignee_name,
      projectName: task.project_name,
      taskTitle: task.title,
      taskUrl: taskUrl(task.id),
      dueDate: task.due_date,
      isOverdue,
    });
    const scheduledFor = new Date().toISOString().slice(0, 10);

    try {
      await enqueueEmail({
        ...email,
        idempotencyKey: `task-deadline:${task.id}:${scheduledFor}`,
        recipientEmail: task.assignee_email,
        recipientName: task.assignee_name,
      });
      await pool.query('UPDATE tasks SET deadline_reminder_sent = TRUE WHERE id = $1', [task.id]);
      remindersSent += 1;
    } catch (error) {
      console.error(`Failed to enqueue deadline reminder for task ${task.id}:`, error);
    }
  }

  return remindersSent;
}
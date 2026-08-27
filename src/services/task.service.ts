import { pool } from '../db/connection';
import { isProjectMember } from '../db/repositories/membership.repository';
import { findTask, type TaskRow } from '../db/repositories/task.repository';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { requireAdmin, requireProjectAccess, requireProjectLead } from './project-access.service';

const TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'reviewing', 'reviewed', 'done']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);

type CreateTaskInput = {
  projectId: number;
  milestoneId: number | null;
  assigneeUserId: number | null;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  estimatedHours: number | null;
  blockerNote: string | null;
};

type TaskUpdateInput = Partial<Omit<CreateTaskInput, 'projectId'>> & { status?: string };

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${fieldName} is required.`);
  return value.trim();
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(400, 'Invalid text value.');
  return value.trim() || null;
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new AppError(400, 'Invalid numeric value.');
  return value;
}

function optionalIdentifier(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new AppError(400, 'Invalid identifier.');
  return value;
}

function validatePriority(value: unknown): string {
  const priority = value ?? 'medium';
  if (typeof priority !== 'string' || !TASK_PRIORITIES.has(priority)) throw new AppError(400, 'Invalid task priority.');
  return priority;
}

async function validateMilestone(projectId: number, milestoneId: number | null): Promise<void> {
  if (!milestoneId) return;
  const result = await pool.query('SELECT id FROM milestones WHERE id = $1 AND project_id = $2', [milestoneId, projectId]);
  if (!result.rows[0]) throw new AppError(400, 'The milestone must belong to the task project.');
}

async function validateAssignee(projectId: number, assigneeUserId: number | null): Promise<void> {
  if (!assigneeUserId) return;
  if (!(await isProjectMember(assigneeUserId, projectId))) {
    throw new AppError(400, 'The assignee must be a member of the task project.');
  }
}

async function writeActivity(taskId: number, actorUserId: number, eventType: string, previousValue: unknown, newValue: unknown): Promise<void> {
  await pool.query(`
    INSERT INTO task_activity (task_id, actor_user_id, event_type, previous_value, new_value)
    VALUES ($1, $2, $3, $4, $5)
  `, [taskId, actorUserId, eventType, JSON.stringify(previousValue), JSON.stringify(newValue)]);
}

function canTransitionAsAssignee(currentStatus: string, nextStatus: string): boolean {
  const permittedTransitions: Record<string, string[]> = {
    todo: ['in_progress'],
    in_progress: ['blocked', 'reviewing'],
    blocked: ['in_progress', 'reviewing'],
  };
  return permittedTransitions[currentStatus]?.includes(nextStatus) ?? false;
}

async function requireMutableTask(user: AuthenticatedUser, task: TaskRow, updates: TaskUpdateInput): Promise<void> {
  if (user.role === 'admin') return;
  await requireProjectAccess(user, task.project_id);

  const hasOnlyStatusUpdate = Object.keys(updates).every((key) => key === 'status');
  if (task.assignee_user_id === user.id && hasOnlyStatusUpdate && updates.status && canTransitionAsAssignee(task.status, updates.status)) {
    return;
  }

  await requireProjectLead(user, task.project_id);
}

function parseCreateTaskInput(body: unknown): CreateTaskInput {
  const input = body as Record<string, unknown>;
  const projectId = optionalIdentifier(input.project_id);
  if (!projectId) throw new AppError(400, 'project_id is required.');
  return {
    projectId,
    milestoneId: optionalIdentifier(input.milestone_id),
    assigneeUserId: optionalIdentifier(input.assignee_user_id),
    title: requireText(input.title, 'title'),
    description: optionalText(input.description),
    priority: validatePriority(input.priority),
    dueDate: optionalText(input.due_date),
    estimatedHours: optionalNumber(input.estimated_hours),
    blockerNote: optionalText(input.blocker_note),
  };
}

function parseTaskUpdateInput(body: unknown): TaskUpdateInput {
  const input = body as Record<string, unknown>;
  const updates: TaskUpdateInput = {};
  if ('title' in input) updates.title = requireText(input.title, 'title');
  if ('description' in input) updates.description = optionalText(input.description);
  if ('milestone_id' in input) updates.milestoneId = optionalIdentifier(input.milestone_id);
  if ('assignee_user_id' in input) updates.assigneeUserId = optionalIdentifier(input.assignee_user_id);
  if ('priority' in input) updates.priority = validatePriority(input.priority);
  if ('due_date' in input) updates.dueDate = optionalText(input.due_date);
  if ('estimated_hours' in input) updates.estimatedHours = optionalNumber(input.estimated_hours);
  if ('blocker_note' in input) updates.blockerNote = optionalText(input.blocker_note);
  if ('status' in input) {
    if (typeof input.status !== 'string' || !TASK_STATUSES.has(input.status)) throw new AppError(400, 'Invalid task status.');
    updates.status = input.status;
  }
  if (Object.keys(updates).length === 0) throw new AppError(400, 'No supported task fields were provided.');
  return updates;
}

export async function createTask(user: AuthenticatedUser, body: unknown): Promise<TaskRow> {
  const input = parseCreateTaskInput(body);
  await requireProjectLead(user, input.projectId);
  await validateMilestone(input.projectId, input.milestoneId);
  await validateAssignee(input.projectId, input.assigneeUserId);

  let taskId: number;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO tasks (project_id, milestone_id, assignee_user_id, title, description, status, priority, due_date, estimated_hours, blocker_note)
      VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8, $9)
      RETURNING id
    `, [input.projectId, input.milestoneId, input.assigneeUserId, input.title, input.description, input.priority, input.dueDate, input.estimatedHours, input.blockerNote]);
    taskId = result.rows[0].id as number;
    await client.query(`
      INSERT INTO task_activity (task_id, actor_user_id, event_type, previous_value, new_value)
      VALUES ($1, $2, $3, $4, $5)
    `, [taskId, user.id, 'created', JSON.stringify(null), JSON.stringify({ title: input.title })]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const task = await findTask(taskId);
  if (!task) throw new AppError(500, 'Task creation failed.');
  return task;
}

export async function updateTask(user: AuthenticatedUser, taskId: number, body: unknown): Promise<TaskRow> {
  const task = await findTask(taskId);
  if (!task) throw new AppError(404, 'Task unavailable.');
  const updates = parseTaskUpdateInput(body);
  await requireMutableTask(user, task, updates);

  if (user.role !== 'admin' && updates.status && (updates.status === 'reviewed' || updates.status === 'done')) {
    throw new AppError(403, 'Only an administrator can review or complete a task.');
  }
  if (updates.milestoneId !== undefined) await validateMilestone(task.project_id, updates.milestoneId);
  if (updates.assigneeUserId !== undefined) await validateAssignee(task.project_id, updates.assigneeUserId);

  const nextTask = {
    milestoneId: updates.milestoneId ?? task.milestone_id ?? null,
    assigneeUserId: updates.assigneeUserId ?? task.assignee_user_id ?? null,
    title: updates.title ?? String(task.title),
    description: updates.description ?? task.description ?? null,
    status: updates.status ?? task.status,
    priority: updates.priority ?? String(task.priority),
    dueDate: updates.dueDate ?? task.due_date ?? null,
    estimatedHours: updates.estimatedHours ?? task.estimated_hours ?? null,
    blockerNote: updates.blockerNote ?? task.blocker_note ?? null,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE tasks SET milestone_id = $1, assignee_user_id = $2, title = $3,
        description = $4, status = $5, priority = $6, due_date = $7,
        estimated_hours = $8, blocker_note = $9, updated_at = NOW()
      WHERE id = $10
    `, [nextTask.milestoneId, nextTask.assigneeUserId, nextTask.title, nextTask.description, nextTask.status, nextTask.priority, nextTask.dueDate, nextTask.estimatedHours, nextTask.blockerNote, taskId]);
    await client.query(`
      INSERT INTO task_activity (task_id, actor_user_id, event_type, previous_value, new_value)
      VALUES ($1, $2, $3, $4, $5)
    `, [taskId, user.id, 'updated', JSON.stringify(task), JSON.stringify(nextTask)]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const updatedTask = await findTask(taskId);
  if (!updatedTask) throw new AppError(500, 'Task update failed.');
  return updatedTask;
}

export async function deleteTask(user: AuthenticatedUser, taskId: number): Promise<void> {
  requireAdmin(user);
  const task = await findTask(taskId);
  if (!task) throw new AppError(404, 'Task unavailable.');
  await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
}

export async function addTaskComment(user: AuthenticatedUser, taskId: number, body: unknown): Promise<Record<string, unknown>> {
  const task = await findTask(taskId);
  if (!task) throw new AppError(404, 'Task unavailable.');
  await requireProjectAccess(user, task.project_id);
  const commentBody = requireText((body as { body?: unknown }).body, 'Comment');
  if (commentBody.length > 2000) throw new AppError(400, 'Comment must be 2,000 characters or fewer.');

  const client = await pool.connect();
  let commentId: number;
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO task_comments (task_id, author_user_id, body)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [taskId, user.id, commentBody]);
    commentId = result.rows[0].id as number;
    await client.query(`
      INSERT INTO task_activity (task_id, actor_user_id, event_type, previous_value, new_value)
      VALUES ($1, $2, $3, $4, $5)
    `, [taskId, user.id, 'commented', JSON.stringify(null), JSON.stringify({ commentId })]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const commentResult = await pool.query(`
    SELECT task_comments.id, task_comments.task_id, task_comments.body, task_comments.created_at, users.name AS author
    FROM task_comments JOIN users ON users.id = task_comments.author_user_id
    WHERE task_comments.id = $1
  `, [commentId!]);
  return commentResult.rows[0] as Record<string, unknown>;
}

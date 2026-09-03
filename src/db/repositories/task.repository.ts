import { pool } from '../connection';

export type TaskRow = Record<string, unknown> & {
  id: string;
  project_id: string;
  assignee_user_id: string | null;
  status: string;
  row_version: string;
};

export async function listTasksForUser(userId: string, isAdmin: boolean): Promise<TaskRow[]> {
  if (isAdmin) {
    const result = await pool.query(`
      SELECT tasks.*, projects.name AS project_name, users.name AS assignee_name,
        milestones.title AS milestone_title
      FROM tasks
      JOIN projects ON projects.id = tasks.project_id
      LEFT JOIN users ON users.id = tasks.assignee_user_id
      LEFT JOIN milestones ON milestones.id = tasks.milestone_id
      ORDER BY tasks.due_date ASC, tasks.id ASC
    `);
    return result.rows as TaskRow[];
  }

  const result = await pool.query(`
    SELECT tasks.*, projects.name AS project_name, users.name AS assignee_name,
      milestones.title AS milestone_title
    FROM tasks
    JOIN projects ON projects.id = tasks.project_id
    LEFT JOIN users ON users.id = tasks.assignee_user_id
    LEFT JOIN milestones ON milestones.id = tasks.milestone_id
    WHERE tasks.assignee_user_id = $1 AND tasks.project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $2)
    ORDER BY tasks.due_date ASC, tasks.id ASC
  `, [userId, userId]);
  return result.rows as TaskRow[];
}

export async function findTask(taskId: string): Promise<TaskRow | undefined> {
  const result = await pool.query(`
    SELECT tasks.*, tasks.xmin::text AS row_version, projects.name AS project_name,
      milestones.title AS milestone_title, users.name AS assignee_name
    FROM tasks
    JOIN projects ON projects.id = tasks.project_id
    LEFT JOIN milestones ON milestones.id = tasks.milestone_id
    LEFT JOIN users ON users.id = tasks.assignee_user_id
    WHERE tasks.id = $1
  `, [taskId]);
  return result.rows[0] as TaskRow | undefined;
}

export async function listTaskComments(taskId: string): Promise<Record<string, unknown>[]> {
  const result = await pool.query(`
    SELECT task_comments.id, task_comments.task_id, task_comments.body, task_comments.created_at,
      users.name AS author, task_comments.author AS legacy_author
    FROM task_comments
    LEFT JOIN users ON users.id = task_comments.author_user_id
    WHERE task_comments.task_id = $1
    ORDER BY task_comments.created_at ASC, task_comments.id ASC
  `, [taskId]);
  return result.rows as Record<string, unknown>[];
}

export async function listTaskActivity(taskId: string): Promise<Record<string, unknown>[]> {
  const result = await pool.query(`
    SELECT task_activity.*, users.name AS actor_name
    FROM task_activity
    LEFT JOIN users ON users.id = task_activity.actor_user_id
    WHERE task_activity.task_id = $1
    ORDER BY task_activity.created_at ASC, task_activity.id ASC
  `, [taskId]);
  return result.rows as Record<string, unknown>[];
}

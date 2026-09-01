import type { Pool, PoolClient } from 'pg';
import { pool } from '../connection';

export type ProjectRow = Record<string, unknown> & { id: number };

export async function findProject(projectId: number): Promise<ProjectRow | undefined> {
  const result = await pool.query(`
    SELECT projects.*, owner_user.name AS owner_name
    FROM projects
    LEFT JOIN users owner_user ON owner_user.id = projects.owner_user_id
    WHERE projects.id = $1
  `, [projectId]);
  return result.rows[0] as ProjectRow | undefined;
}

export async function listProjectsForUser(userId: number, isAdmin: boolean): Promise<ProjectRow[]> {
  if (isAdmin) {
    const result = await pool.query(`
      SELECT p.*, owner_user.name AS owner_name,
        COUNT(t.id)::int AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'blocked')::int AS blocked_tasks
      FROM projects p
      LEFT JOIN users owner_user ON owner_user.id = p.owner_user_id
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id, owner_user.name
      ORDER BY p.priority DESC, p.deadline ASC
    `);
    return result.rows as ProjectRow[];
  }

  const result = await pool.query(`
    SELECT p.*, owner_user.name AS owner_name,
      COUNT(t.id)::int AS total_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'blocked')::int AS blocked_tasks
    FROM projects p
    LEFT JOIN users owner_user ON owner_user.id = p.owner_user_id
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.id IN (SELECT project_id FROM project_memberships WHERE user_id = $1)
    GROUP BY p.id, owner_user.name
    ORDER BY p.priority DESC, p.deadline ASC
  `, [userId]);
  return result.rows as ProjectRow[];
}

export async function listProjectTasks(projectId: number): Promise<ProjectRow[]> {
  const result = await pool.query(`
    SELECT tasks.*, users.name AS assignee_name
    FROM tasks
    LEFT JOIN users ON users.id = tasks.assignee_user_id
    WHERE tasks.project_id = $1
    ORDER BY tasks.due_date ASC, tasks.id ASC
  `, [projectId]);
  return result.rows as ProjectRow[];
}

export async function getProjectTaskSummary(projectId: number): Promise<Record<string, number>> {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE status = 'done')::int AS done_tasks,
      COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_tasks
    FROM tasks
    WHERE project_id = $1
  `, [projectId]);
  return result.rows[0] as Record<string, number>;
}

export async function listProjectMilestones(projectId: number): Promise<ProjectRow[]> {
  const result = await pool.query(`
    SELECT milestones.*, project_phases.name AS phase_name
    FROM milestones
    LEFT JOIN project_phases ON project_phases.id = milestones.phase_id
    WHERE milestones.project_id = $1
    ORDER BY milestones.target_date ASC, milestones.id ASC
  `, [projectId]);
  return result.rows as ProjectRow[];
}

export async function findMilestoneDetail(milestoneId: number): Promise<ProjectRow | undefined> {
  const result = await pool.query(`
    SELECT milestones.*, project_phases.name AS phase_name,
      projects.name AS project_name
    FROM milestones
    LEFT JOIN project_phases ON project_phases.id = milestones.phase_id
    JOIN projects ON projects.id = milestones.project_id
    WHERE milestones.id = $1
  `, [milestoneId]);
  return result.rows[0] as ProjectRow | undefined;
}

export async function listMilestoneTasks(milestoneId: number): Promise<ProjectRow[]> {
  const result = await pool.query(`
    SELECT tasks.id, tasks.title, tasks.status, tasks.priority, tasks.due_date,
      tasks.assignee_user_id, tasks.project_id, users.name AS assignee_name,
      projects.name AS project_name
    FROM tasks
    JOIN projects ON projects.id = tasks.project_id
    LEFT JOIN users ON users.id = tasks.assignee_user_id
    WHERE tasks.milestone_id = $1
    ORDER BY tasks.due_date ASC, tasks.id ASC
  `, [milestoneId]);
  return result.rows as ProjectRow[];
}

export async function listProjectMilestoneMembers(milestoneId: number): Promise<ProjectRow[]> {
  const result = await pool.query(`
    SELECT DISTINCT users.id AS user_id, users.name, users.email_display AS email,
      project_memberships.project_role
    FROM tasks
    JOIN project_memberships ON project_memberships.user_id = tasks.assignee_user_id
      AND project_memberships.project_id = tasks.project_id
    JOIN users ON users.id = tasks.assignee_user_id
    WHERE tasks.milestone_id = $1 AND tasks.assignee_user_id IS NOT NULL
    ORDER BY users.name
  `, [milestoneId]);
  return result.rows as ProjectRow[];
}

export async function listProjectMembers(projectId: number): Promise<ProjectRow[]> {
  const result = await pool.query(`
    SELECT users.id, users.id AS user_id, project_memberships.project_id,
      users.name, users.email_display AS email, users.role, users.status, project_memberships.project_role
    FROM project_memberships
    JOIN users ON users.id = project_memberships.user_id
    WHERE project_memberships.project_id = $1
    ORDER BY users.name
  `, [projectId]);
  return result.rows as ProjectRow[];
}

type Queryable = Pick<Pool | PoolClient, 'query'>;

export async function createProjectRecord(input: Record<string, unknown>, database: Queryable = pool): Promise<number> {
  const result = await database.query(`
    INSERT INTO projects (
      name, description, owner_user_id, status, priority, start_date, deadline,
      website_url, drive_folder_url, budget_allocated_amount, budget_currency
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    RETURNING id
  `, [
    input.name, input.description, input.ownerUserId, input.status, input.priority,
    input.startDate, input.deadline, input.websiteUrl, input.driveFolderUrl,
    input.budgetAllocatedAmount, input.budgetCurrency
  ]);
  return Number(result.rows[0].id);
}

export async function updateProjectRecord(projectId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(`
    UPDATE projects SET
      name = $1, description = $2, owner_user_id = $3,
      status = $4, priority = $5, start_date = $6, deadline = $7,
      website_url = $8, drive_folder_url = $9,
      budget_allocated_amount = $10, budget_currency = $11,
      updated_at = NOW()
    WHERE id = $12
  `, [
    input.name, input.description, input.ownerUserId,
    input.status, input.priority, input.startDate, input.deadline,
    input.websiteUrl, input.driveFolderUrl,
    input.budgetAllocatedAmount, input.budgetCurrency, projectId
  ]);
}

export async function deleteProjectRecord(projectId: number): Promise<void> {
  await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
}

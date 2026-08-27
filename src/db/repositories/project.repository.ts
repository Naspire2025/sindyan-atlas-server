import { pool } from '../connection';

export type ProjectRow = Record<string, unknown> & { id: number };

export async function findProject(projectId: number): Promise<ProjectRow | undefined> {
  const result = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  return result.rows[0] as ProjectRow | undefined;
}

export async function listProjectsForUser(userId: number, isAdmin: boolean): Promise<ProjectRow[]> {
  if (isAdmin) {
    const result = await pool.query(`
      SELECT p.*,
        COUNT(t.id) AS total_tasks,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
        SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END) AS blocked_tasks
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY p.priority DESC, p.deadline ASC
    `);
    return result.rows as ProjectRow[];
  }

  const result = await pool.query(`
    SELECT p.*,
      COUNT(t.id) AS total_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
      SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END) AS blocked_tasks
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.id IN (SELECT project_id FROM project_memberships WHERE user_id = $1)
    GROUP BY p.id
    ORDER BY p.priority DESC, p.deadline ASC
  `, [userId]);
  return result.rows as ProjectRow[];
}

export async function listProjectTasks(projectId: number): Promise<ProjectRow[]> {
  const result = await pool.query('SELECT * FROM tasks WHERE project_id = $1 ORDER BY due_date ASC', [projectId]);
  return result.rows as ProjectRow[];
}

export async function listProjectMilestones(projectId: number): Promise<ProjectRow[]> {
  const result = await pool.query('SELECT * FROM milestones WHERE project_id = $1 ORDER BY target_date ASC', [projectId]);
  return result.rows as ProjectRow[];
}

export async function listProjectMembers(projectId: number): Promise<ProjectRow[]> {
  const result = await pool.query(`
    SELECT users.id, users.name, users.email_display AS email, users.role, users.status, project_memberships.project_role
    FROM project_memberships
    JOIN users ON users.id = project_memberships.user_id
    WHERE project_memberships.project_id = $1
    ORDER BY users.name
  `, [projectId]);
  return result.rows as ProjectRow[];
}

export async function createProjectRecord(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(`
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

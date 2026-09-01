import { pool } from '../connection';

export type OverviewProject = Record<string, unknown> & {
  id: number;
  name: string;
  status: string;
  priority: string;
};

export async function fetchOverviewProjects(userId: number, isAdmin: boolean): Promise<OverviewProject[]> {
  const membershipClause = isAdmin ? '' : 'WHERE p.id IN (SELECT project_id FROM project_memberships WHERE user_id = $1)';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(`
    SELECT
      p.id, p.name, p.status, p.priority, p.owner_user_id, p.start_date, p.deadline,
      p.budget_allocated_amount, p.budget_currency,
      COUNT(t.id) AS total_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
      SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END) AS blocked_tasks,
      SUM(CASE WHEN t.due_date::date < CURRENT_DATE AND t.status != 'done' THEN 1 ELSE 0 END) AS overdue_tasks
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    ${membershipClause}
    GROUP BY p.id
    ORDER BY p.priority DESC, p.deadline ASC
  `, parameters);
  return result.rows as OverviewProject[];
}

export async function fetchOverdueMilestones(userId: number, isAdmin: boolean): Promise<Record<string, unknown>[]> {
  const membershipClause = isAdmin ? '' : 'm.project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(`
    SELECT m.id, m.title, m.target_date, m.status, m.project_id, p.name AS project_name
    FROM milestones m
    JOIN projects p ON p.id = m.project_id
    WHERE ${membershipClause} m.target_date::date < CURRENT_DATE AND m.status NOT IN ('done', 'missed')
    ORDER BY m.target_date ASC
  `, parameters);
  return result.rows as Record<string, unknown>[];
}

export async function fetchBlockedTasks(userId: number, isAdmin: boolean): Promise<Record<string, unknown>[]> {
  const membershipClause = isAdmin ? '' : 't.project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id, p.name AS project_name,
           u.name AS assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_user_id
    WHERE ${membershipClause} t.status = 'blocked'
    ORDER BY t.due_date ASC
  `, parameters);
  return result.rows as Record<string, unknown>[];
}

export async function fetchOverdueTasks(userId: number, isAdmin: boolean): Promise<Record<string, unknown>[]> {
  const membershipClause = isAdmin ? '' : 't.project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id, p.name AS project_name,
      u.name AS assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_user_id
    WHERE ${membershipClause} t.due_date::date < CURRENT_DATE AND t.status != 'done'
    ORDER BY t.due_date ASC, t.id ASC
  `, parameters);
  return result.rows as Record<string, unknown>[];
}

export async function fetchStalledTasks(userId: number, isAdmin: boolean, stalledDays: number): Promise<Record<string, unknown>[]> {
  const membershipClause = isAdmin ? '' : 't.project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const daysParameter = isAdmin ? 1 : 2;
  const parameters = isAdmin ? [stalledDays] : [userId, stalledDays];
  const result = await pool.query(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date, t.updated_at, t.project_id,
      p.name AS project_name, u.name AS assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_user_id
    WHERE ${membershipClause} t.status NOT IN ('done', 'reviewed')
      AND t.updated_at < NOW() - ($${daysParameter} * INTERVAL '1 day')
    ORDER BY t.updated_at ASC, t.id ASC
  `, parameters);
  return result.rows as Record<string, unknown>[];
}

export async function fetchHighSeverityRisks(userId: number, isAdmin: boolean): Promise<Record<string, unknown>[]> {
  const membershipClause = isAdmin ? '' : 'r.project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(`
    SELECT r.id, r.title, r.severity, r.status, r.project_id, p.name AS project_name,
           u.name AS owner_name
    FROM risks r
    JOIN projects p ON p.id = r.project_id
    LEFT JOIN users u ON u.id = r.owner_user_id
    WHERE ${membershipClause} r.severity IN ('high', 'critical') AND r.status != 'resolved'
    ORDER BY r.severity DESC, r.due_date ASC
  `, parameters);
  return result.rows as Record<string, unknown>[];
}

export async function fetchOverdueIssues(userId: number, isAdmin: boolean): Promise<Record<string, unknown>[]> {
  const membershipClause = isAdmin ? '' : 'i.project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(`
    SELECT i.id, i.title, i.priority, i.status, i.target_resolution_date, i.project_id, p.name AS project_name,
           u.name AS owner_name
    FROM issues i
    JOIN projects p ON p.id = i.project_id
    LEFT JOIN users u ON u.id = i.owner_user_id
    WHERE ${membershipClause} i.target_resolution_date::date < CURRENT_DATE AND i.status != 'resolved'
    ORDER BY i.target_resolution_date ASC
  `, parameters);
  return result.rows as Record<string, unknown>[];
}

export async function countOpenRisks(userId: number, isAdmin: boolean): Promise<number> {
  const membershipClause = isAdmin ? '' : 'project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM risks WHERE ${membershipClause} status != 'resolved'`,
    parameters,
  );
  return result.rows[0].count as number;
}

export async function countOpenIssues(userId: number, isAdmin: boolean): Promise<number> {
  const membershipClause = isAdmin ? '' : 'project_id IN (SELECT project_id FROM project_memberships WHERE user_id = $1) AND';
  const parameters = isAdmin ? [] : [userId];
  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM issues WHERE ${membershipClause} status != 'resolved'`,
    parameters,
  );
  return result.rows[0].count as number;
}

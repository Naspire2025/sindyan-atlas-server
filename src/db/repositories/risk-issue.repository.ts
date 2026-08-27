import { pool } from '../connection';

export type RiskRow = Record<string, unknown> & { id: number; project_id: number };
export type IssueRow = Record<string, unknown> & { id: number; project_id: number };

export async function findRisk(riskId: number): Promise<RiskRow | undefined> {
  const result = await pool.query(
    `SELECT r.*, u.name AS owner_name
     FROM risks r LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE r.id = $1`,
    [riskId],
  );
  return result.rows[0] as RiskRow | undefined;
}

export async function listRisksForProject(projectId: number): Promise<RiskRow[]> {
  const result = await pool.query(
    `SELECT r.*, u.name AS owner_name
     FROM risks r LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE r.project_id = $1 ORDER BY r.severity DESC, r.created_at DESC`,
    [projectId],
  );
  return result.rows as RiskRow[];
}

export async function createRisk(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(
    `INSERT INTO risks (project_id, title, description, severity, probability, owner_user_id, due_date, status, mitigation_progress, mitigation_note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [input.projectId, input.title, input.description, input.severity, input.probability, input.ownerUserId, input.dueDate, input.status, input.mitigationProgress, input.mitigationNote, input.createdByUserId],
  );
  return result.rows[0].id as number;
}

export async function updateRisk(riskId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE risks
     SET title = $1, description = $2, severity = $3, probability = $4,
         owner_user_id = $5, due_date = $6, status = $7,
         mitigation_progress = $8, mitigation_note = $9,
         updated_at = NOW()
     WHERE id = $10`,
    [input.title, input.description, input.severity, input.probability, input.ownerUserId, input.dueDate, input.status, input.mitigationProgress, input.mitigationNote, riskId],
  );
}

export async function deleteRisk(riskId: number): Promise<void> {
  await pool.query('DELETE FROM risks WHERE id = $1', [riskId]);
}

export async function findIssue(issueId: number): Promise<IssueRow | undefined> {
  const result = await pool.query(
    `SELECT i.*, u.name AS owner_name
     FROM issues i LEFT JOIN users u ON u.id = i.owner_user_id
     WHERE i.id = $1`,
    [issueId],
  );
  return result.rows[0] as IssueRow | undefined;
}

export async function listIssuesForProject(projectId: number): Promise<IssueRow[]> {
  const result = await pool.query(
    `SELECT i.*, u.name AS owner_name
     FROM issues i LEFT JOIN users u ON u.id = i.owner_user_id
     WHERE i.project_id = $1 ORDER BY i.priority DESC, i.created_at DESC`,
    [projectId],
  );
  return result.rows as IssueRow[];
}

export async function createIssue(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(
    `INSERT INTO issues (project_id, title, description, priority, owner_user_id, target_resolution_date, status, resolution_progress, resolution_note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [input.projectId, input.title, input.description, input.priority, input.ownerUserId, input.targetResolutionDate, input.status, input.resolutionProgress, input.resolutionNote, input.createdByUserId],
  );
  return result.rows[0].id as number;
}

export async function updateIssue(issueId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE issues
     SET title = $1, description = $2, priority = $3,
         owner_user_id = $4, target_resolution_date = $5,
         status = $6, resolution_progress = $7,
         resolution_note = $8, updated_at = NOW()
     WHERE id = $9`,
    [input.title, input.description, input.priority, input.ownerUserId, input.targetResolutionDate, input.status, input.resolutionProgress, input.resolutionNote, issueId],
  );
}

export async function deleteIssue(issueId: number): Promise<void> {
  await pool.query('DELETE FROM issues WHERE id = $1', [issueId]);
}

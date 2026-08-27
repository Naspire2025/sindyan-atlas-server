import { pool } from '../connection';
import type { ProjectRole } from '../../types/auth';

export async function findProjectRole(userId: number, projectId: number): Promise<ProjectRole | undefined> {
  const result = await pool.query(`
    SELECT project_role
    FROM project_memberships
    WHERE user_id = $1 AND project_id = $2
  `, [userId, projectId]);
  return result.rows[0]?.project_role as ProjectRole | undefined;
}

export async function isProjectMember(userId: number, projectId: number): Promise<boolean> {
  return Boolean(await findProjectRole(userId, projectId));
}

export async function listProjectMemberIds(projectId: number): Promise<number[]> {
  const result = await pool.query('SELECT user_id FROM project_memberships WHERE project_id = $1', [projectId]);
  return result.rows.map((membership: { user_id: number }) => membership.user_id);
}

export async function addProjectMember(projectId: number, userId: number, projectRole: ProjectRole): Promise<void> {
  await pool.query(`
    INSERT INTO project_memberships (project_id, user_id, project_role)
    VALUES ($1, $2, $3)
    ON CONFLICT(project_id, user_id) DO UPDATE SET project_role = excluded.project_role
  `, [projectId, userId, projectRole]);
}

export async function removeProjectMember(projectId: number, userId: number): Promise<void> {
  await pool.query('DELETE FROM project_memberships WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
}

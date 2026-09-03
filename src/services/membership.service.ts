import { pool } from '../db/connection';
import { addProjectMember, findProjectRole, removeProjectMember } from '../db/repositories/membership.repository';
import { findProject } from '../db/repositories/project.repository';
import type { AuthenticatedUser, ProjectRole } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isUuid } from '../utils/request.util';
import { requireProjectLead } from './project-access.service';

function parseProjectRole(value: unknown): ProjectRole {
  if (value === undefined || value === 'member') return 'member';
  if (value === 'project_lead') return 'project_lead';
  throw new AppError(400, 'project_role must be member or project_lead.');
}

function parseUserId(value: unknown): string {
  if (!isUuid(value)) {
    throw new AppError(400, 'user_id must be a valid UUID.');
  }
  return value;
}

export async function addMemberToProject(user: AuthenticatedUser, projectId: string, body: unknown): Promise<void> {
  if (!(await findProject(projectId))) throw new AppError(404, 'Project unavailable.');
  await requireProjectLead(user, projectId);
  const input = body as { user_id?: unknown; project_role?: unknown };
  const userId = parseUserId(input.user_id);
  const existingUser = await pool.query("SELECT id FROM users WHERE id = $1 AND status = 'active'", [userId]);
  if (!existingUser.rows[0]) throw new AppError(400, 'Project members must be active users.');
  const projectRole = parseProjectRole(input.project_role);
  const existingRole = await findProjectRole(userId, projectId);
  if (existingRole === 'project_lead' && projectRole !== 'project_lead' && (await countProjectLeads(projectId)) <= 1) {
    throw new AppError(409, 'A project must retain one project lead.');
  }
  await addProjectMember(projectId, userId, projectRole);
}

export async function removeMemberFromProject(user: AuthenticatedUser, projectId: string, userId: string): Promise<void> {
  if (!(await findProject(projectId))) throw new AppError(404, 'Project unavailable.');
  await requireProjectLead(user, projectId);
  if ((await findProjectRole(userId, projectId)) === 'project_lead' && (await countProjectLeads(projectId)) <= 1) {
    throw new AppError(409, 'A project must retain one project lead.');
  }
  await removeProjectMember(projectId, userId);
}

async function countProjectLeads(projectId: string): Promise<number> {
  const result = await pool.query("SELECT COUNT(*) AS count FROM project_memberships WHERE project_id = $1 AND project_role = 'project_lead'", [projectId]);
  return Number(result.rows[0].count);
}

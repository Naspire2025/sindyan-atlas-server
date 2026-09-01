import { pool } from '../db/connection';
import { createProjectRecord, deleteProjectRecord, findProject, updateProjectRecord, type ProjectRow } from '../db/repositories/project.repository';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isIsoDate } from '../utils/date.util';
import { requireAdmin, requireProjectLead } from './project-access.service';

const PROJECT_STATUSES = new Set(['planning', 'active', 'on_hold', 'blocked', 'completed', 'cancelled']);
const PROJECT_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);

interface ProjectLinkInput {
  label: string;
  linkType: string;
  url: string;
  position: number;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(400, 'Invalid text value.');
  return value.trim() || null;
}

function requiredName(value: unknown): string {
  const name = optionalText(value);
  if (!name) throw new AppError(400, 'name is required.');
  return name;
}

function optionalIdentifier(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new AppError(400, 'Invalid user identifier.');
  return value;
}

function optionalAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new AppError(400, 'Invalid budget amount.');
  return value;
}

function optionalDate(value: unknown, field: string): string | null {
  const date = optionalText(value);
  if (date && !isIsoDate(date)) throw new AppError(400, `${field} must be a valid ISO date.`);
  return date;
}

function optionalHttpsUrl(value: unknown, field: string): string | null {
  const url = optionalText(value);
  if (!url) return null;
  try {
    if (new URL(url).protocol !== 'https:') throw new Error('Invalid protocol');
  } catch {
    throw new AppError(400, `${field} must be an HTTPS URL.`);
  }
  return url;
}

function parseProjectLinks(value: unknown): ProjectLinkInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AppError(400, 'links must be an array.');
  return value.map((link, position) => {
    if (!link || typeof link !== 'object') throw new AppError(400, 'Each project link must be an object.');
    const input = link as Record<string, unknown>;
    const label = requiredName(input.label);
    const linkType = requiredName(input.link_type);
    const url = optionalHttpsUrl(input.url, 'Link URL');
    if (!url) throw new AppError(400, 'Link URL is required.');
    return { label, linkType, url, position };
  });
}

function parseProjectInput(body: unknown, existing?: ProjectRow): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'A project payload is required.');
  const input = body as Record<string, unknown>;
  const status = input.status ?? existing?.status ?? 'planning';
  const priority = input.priority ?? existing?.priority ?? 'medium';
  if (typeof status !== 'string' || !PROJECT_STATUSES.has(status)) throw new AppError(400, 'Invalid project status.');
  if (typeof priority !== 'string' || !PROJECT_PRIORITIES.has(priority)) throw new AppError(400, 'Invalid project priority.');
  return {
    name: 'name' in input ? requiredName(input.name) : String(existing?.name ?? ''),
    description: 'description' in input ? optionalText(input.description) : existing?.description ?? null,
    ownerUserId: 'owner_user_id' in input ? optionalIdentifier(input.owner_user_id) : existing?.owner_user_id ?? null,
    status,
    priority,
    startDate: 'start_date' in input ? optionalDate(input.start_date, 'start_date') : existing?.start_date ?? null,
    deadline: 'deadline' in input ? optionalDate(input.deadline, 'deadline') : existing?.deadline ?? null,
    websiteUrl: 'website_url' in input ? optionalHttpsUrl(input.website_url, 'website_url') : existing?.website_url ?? null,
    driveFolderUrl: 'drive_folder_url' in input ? optionalHttpsUrl(input.drive_folder_url, 'drive_folder_url') : existing?.drive_folder_url ?? null,
    budgetAllocatedAmount: 'budget_allocated_amount' in input ? optionalAmount(input.budget_allocated_amount) : existing?.budget_allocated_amount ?? null,
    budgetCurrency: 'budget_currency' in input ? optionalText(input.budget_currency) : existing?.budget_currency ?? null,
  };
}

async function validateProjectOwner(projectId: number, ownerUserId: unknown): Promise<void> {
  if (ownerUserId === null) return;
  const ownerResult = await pool.query('SELECT id FROM users WHERE id = $1 AND status = $2', [ownerUserId, 'active']);
  if (!ownerResult.rows[0]) throw new AppError(400, 'Project owner must be an active user.');
  if (projectId > 0) {
    const membershipResult = await pool.query('SELECT 1 FROM project_memberships WHERE project_id = $1 AND user_id = $2', [projectId, ownerUserId]);
    if (!membershipResult.rows[0]) throw new AppError(400, 'Project owner must be a project member.');
  }
}

export async function createProject(user: AuthenticatedUser, body: unknown): Promise<ProjectRow> {
  requireAdmin(user);
  const input = parseProjectInput(body);
  const bodyRecord = body as Record<string, unknown>;
  const links = parseProjectLinks(bodyRecord.links);
  if (typeof input.startDate === 'string' && typeof input.deadline === 'string' && input.deadline < input.startDate) {
    throw new AppError(400, 'deadline must not be before start_date.');
  }
  await validateProjectOwner(0, input.ownerUserId);

  const client = await pool.connect();
  let projectId: number;
  try {
    await client.query('BEGIN');
    projectId = await createProjectRecord(input, client);
    if (typeof input.ownerUserId === 'number') {
      await client.query(`
        INSERT INTO project_memberships (project_id, user_id, project_role)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [projectId, input.ownerUserId, 'project_lead']);
    }
    for (const link of links) {
      await client.query(`
        INSERT INTO project_links (project_id, label, link_type, url, position, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [projectId, link.label, link.linkType, link.url, link.position, user.id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return (await findProject(projectId)) as ProjectRow;
}

export async function updateProject(user: AuthenticatedUser, projectId: number, body: unknown): Promise<ProjectRow> {
  const existing = await findProject(projectId);
  if (!existing) throw new AppError(404, 'Project unavailable.');
  await requireProjectLead(user, projectId);
  const input = parseProjectInput(body, existing);
  if (typeof input.startDate === 'string' && typeof input.deadline === 'string' && input.deadline < input.startDate) {
    throw new AppError(400, 'deadline must not be before start_date.');
  }
  if (user.role !== 'admin' && ('budget_allocated_amount' in (body as object) || 'budget_currency' in (body as object))) {
    throw new AppError(403, 'Only an administrator can manage project financial data.');
  }
  await validateProjectOwner(projectId, input.ownerUserId);
  await updateProjectRecord(projectId, input);
  return (await findProject(projectId)) as ProjectRow;
}

export async function deleteProject(user: AuthenticatedUser, projectId: number): Promise<void> {
  requireAdmin(user);
  if (!(await findProject(projectId))) throw new AppError(404, 'Project unavailable.');
  await deleteProjectRecord(projectId);
}

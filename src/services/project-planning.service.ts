import { pool } from '../db/connection';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isIsoDate } from '../utils/date.util';
import { requireAdmin, requireProjectAccess, requireProjectLead } from './project-access.service';

const MILESTONE_STATUSES = new Set(['not_started', 'in_progress', 'done', 'missed']);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${field} is required.`);
  return value.trim();
}

function optionalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isIsoDate(value)) throw new AppError(400, 'Invalid ISO date.');
  return value;
}

function optionalId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new AppError(400, 'Invalid identifier.');
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new AppError(400, `${field} must be a non-negative integer.`);
  return value;
}

async function requireProjectRecord(projectId: number): Promise<void> {
  const result = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!result.rows[0]) throw new AppError(404, 'Project unavailable.');
}

async function validatePhase(projectId: number, phaseId: number | null): Promise<void> {
  if (phaseId) {
    const result = await pool.query('SELECT id FROM project_phases WHERE id = $1 AND project_id = $2', [phaseId, projectId]);
    if (!result.rows[0]) {
      throw new AppError(400, 'The phase must belong to this project.');
    }
  }
}

export async function listProjectLinks(user: AuthenticatedUser, projectId: number): Promise<Record<string, unknown>[]> {
  await requireProjectAccess(user, projectId);
  const result = await pool.query('SELECT * FROM project_links WHERE project_id = $1 ORDER BY position, id', [projectId]);
  return result.rows;
}

export async function createProjectLink(user: AuthenticatedUser, projectId: number, body: unknown): Promise<Record<string, unknown>> {
  await requireProjectLead(user, projectId);
  const input = body as { label?: unknown; link_type?: unknown; url?: unknown; position?: unknown };
  const label = requiredText(input.label, 'label');
  const linkType = requiredText(input.link_type, 'link_type');
  const url = requiredText(input.url, 'url');
  try { if (new URL(url).protocol !== 'https:') throw new Error('protocol'); } catch { throw new AppError(400, 'url must be an HTTPS URL.'); }
  const position = input.position === undefined ? 0 : nonNegativeInteger(input.position, 'position');
  const result = await pool.query('INSERT INTO project_links (project_id, label, link_type, url, position, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [projectId, label, linkType, url, position, user.id]);
  const linkId = result.rows[0].id;
  const linkResult = await pool.query('SELECT * FROM project_links WHERE id = $1', [linkId]);
  return linkResult.rows[0];
}

export async function deleteProjectLink(user: AuthenticatedUser, projectId: number, linkId: number): Promise<void> {
  await requireProjectLead(user, projectId);
  const result = await pool.query('DELETE FROM project_links WHERE id = $1 AND project_id = $2', [linkId, projectId]);
  if (!result.rowCount) throw new AppError(404, 'Project link unavailable.');
}

export async function updateProjectLink(user: AuthenticatedUser, projectId: number, linkId: number, body: unknown): Promise<Record<string, unknown>> {
  await requireProjectLead(user, projectId);
  const existingResult = await pool.query('SELECT * FROM project_links WHERE id = $1 AND project_id = $2', [linkId, projectId]);
  const existing = existingResult.rows[0] as Record<string, unknown> | undefined;
  if (!existing) throw new AppError(404, 'Project link unavailable.');
  const input = body as { label?: unknown; link_type?: unknown; url?: unknown; position?: unknown };
  const url = input.url === undefined ? String(existing.url) : requiredText(input.url, 'url');
  try { if (new URL(url).protocol !== 'https:') throw new Error('protocol'); } catch { throw new AppError(400, 'url must be an HTTPS URL.'); }
  const position = input.position === undefined ? Number(existing.position) : nonNegativeInteger(input.position, 'position');
  await pool.query('UPDATE project_links SET label = $1, link_type = $2, url = $3, position = $4 WHERE id = $5', [
    input.label === undefined ? existing.label : requiredText(input.label, 'label'),
    input.link_type === undefined ? existing.link_type : requiredText(input.link_type, 'link_type'),
    url, position, linkId,
  ]);
  const updatedResult = await pool.query('SELECT * FROM project_links WHERE id = $1', [linkId]);
  return updatedResult.rows[0];
}

export async function listProjectPhases(user: AuthenticatedUser, projectId: number): Promise<Record<string, unknown>[]> {
  await requireProjectAccess(user, projectId);
  const result = await pool.query('SELECT * FROM project_phases WHERE project_id = $1 ORDER BY position, id', [projectId]);
  return result.rows;
}

export async function createProjectPhase(user: AuthenticatedUser, projectId: number, body: unknown): Promise<Record<string, unknown>> {
  await requireProjectLead(user, projectId);
  const input = body as { name?: unknown; position?: unknown; start_date?: unknown; end_date?: unknown };
  const startDate = optionalDate(input.start_date);
  const endDate = optionalDate(input.end_date);
  if (!startDate || !endDate) throw new AppError(400, 'start_date and end_date are required.');
  if (startDate && endDate && endDate < startDate) throw new AppError(400, 'end_date must not be before start_date.');
  const position = input.position === undefined ? 0 : nonNegativeInteger(input.position, 'position');
  const result = await pool.query('INSERT INTO project_phases (project_id, name, position, start_date, end_date) VALUES ($1, $2, $3, $4, $5) RETURNING id', [projectId, requiredText(input.name, 'name'), position, startDate, endDate]);
  const phaseId = result.rows[0].id;
  const phaseResult = await pool.query('SELECT * FROM project_phases WHERE id = $1', [phaseId]);
  return phaseResult.rows[0];
}

export async function updateProjectPhase(user: AuthenticatedUser, projectId: number, phaseId: number, body: unknown): Promise<Record<string, unknown>> {
  await requireProjectLead(user, projectId);
  const existingResult = await pool.query('SELECT * FROM project_phases WHERE id = $1 AND project_id = $2', [phaseId, projectId]);
  const existing = existingResult.rows[0] as Record<string, unknown> | undefined;
  if (!existing) throw new AppError(404, 'Project phase unavailable.');
  const input = body as { name?: unknown; position?: unknown; start_date?: unknown; end_date?: unknown };
  const startDate = input.start_date === undefined ? existing.start_date : optionalDate(input.start_date);
  const endDate = input.end_date === undefined ? existing.end_date : optionalDate(input.end_date);
  if (typeof startDate === 'string' && typeof endDate === 'string' && endDate < startDate) throw new AppError(400, 'end_date must not be before start_date.');
  await pool.query('UPDATE project_phases SET name = $1, position = $2, start_date = $3, end_date = $4 WHERE id = $5', [
    input.name === undefined ? existing.name : requiredText(input.name, 'name'),
    input.position === undefined ? existing.position : nonNegativeInteger(input.position, 'position'),
    startDate, endDate, phaseId,
  ]);
  const updatedResult = await pool.query('SELECT * FROM project_phases WHERE id = $1', [phaseId]);
  return updatedResult.rows[0];
}

export async function listProjectMilestones(user: AuthenticatedUser, projectId: number): Promise<Record<string, unknown>[]> {
  await requireProjectAccess(user, projectId);
  const result = await pool.query(`
    SELECT milestones.*, project_phases.name AS phase_name
    FROM milestones
    LEFT JOIN project_phases ON project_phases.id = milestones.phase_id
    WHERE milestones.project_id = $1
    ORDER BY milestones.target_date, milestones.id
  `, [projectId]);
  return result.rows;
}

export async function createProjectMilestone(user: AuthenticatedUser, projectId: number, body: unknown): Promise<Record<string, unknown>> {
  await requireProjectLead(user, projectId);
  const input = body as { title?: unknown; target_date?: unknown; phase_id?: unknown; status?: unknown };
  const phaseId = optionalId(input.phase_id);
  if (!phaseId) throw new AppError(400, 'phase_id is required.');
  await validatePhase(projectId, phaseId);
  const targetDate = optionalDate(input.target_date);
  if (!targetDate) throw new AppError(400, 'target_date is required.');
  const status = input.status ?? 'not_started';
  if (typeof status !== 'string' || !MILESTONE_STATUSES.has(status)) throw new AppError(400, 'Invalid milestone status.');
  const result = await pool.query('INSERT INTO milestones (project_id, phase_id, title, target_date, status) VALUES ($1, $2, $3, $4, $5) RETURNING id', [projectId, phaseId, requiredText(input.title, 'title'), targetDate, status]);
  const milestoneId = result.rows[0].id;
  const milestoneResult = await pool.query('SELECT * FROM milestones WHERE id = $1', [milestoneId]);
  return milestoneResult.rows[0];
}

export async function updateMilestone(user: AuthenticatedUser, milestoneId: number, body: unknown): Promise<Record<string, unknown>> {
  const existingResult = await pool.query('SELECT * FROM milestones WHERE id = $1', [milestoneId]);
  const existing = existingResult.rows[0] as Record<string, unknown> | undefined;
  if (!existing) throw new AppError(404, 'Milestone unavailable.');
  const projectId = Number(existing.project_id);
  await requireProjectLead(user, projectId);
  const input = body as { title?: unknown; target_date?: unknown; phase_id?: unknown; status?: unknown };
  const phaseId = input.phase_id === undefined ? Number(existing.phase_id) || null : optionalId(input.phase_id);
  await validatePhase(projectId, phaseId);
  const status = input.status === undefined ? String(existing.status) : input.status;
  if (typeof status !== 'string' || !MILESTONE_STATUSES.has(status)) throw new AppError(400, 'Invalid milestone status.');
  await pool.query('UPDATE milestones SET phase_id = $1, title = $2, target_date = $3, status = $4 WHERE id = $5', [
    phaseId,
    input.title === undefined ? existing.title : requiredText(input.title, 'title'),
    input.target_date === undefined ? existing.target_date : optionalDate(input.target_date),
    status, milestoneId,
  ]);
  const updatedResult = await pool.query('SELECT * FROM milestones WHERE id = $1', [milestoneId]);
  return updatedResult.rows[0];
}

export async function deleteMilestone(user: AuthenticatedUser, milestoneId: number): Promise<void> {
  const milestoneResult = await pool.query('SELECT project_id FROM milestones WHERE id = $1', [milestoneId]);
  const milestone = milestoneResult.rows[0] as { project_id: number } | undefined;
  if (!milestone) throw new AppError(404, 'Milestone unavailable.');
  requireAdmin(user);
  await pool.query('DELETE FROM milestones WHERE id = $1', [milestoneId]);
}

export async function deleteProjectPhase(user: AuthenticatedUser, projectId: number, phaseId: number): Promise<void> {
  await requireProjectLead(user, projectId);
  await requireProjectRecord(projectId);
  const milestoneResult = await pool.query('SELECT COUNT(*) AS count FROM milestones WHERE project_id = $1 AND phase_id = $2', [projectId, phaseId]);
  if (Number(milestoneResult.rows[0].count) > 0) throw new AppError(409, 'Move or delete this phase’s milestones before deleting the phase.');
  const result = await pool.query('DELETE FROM project_phases WHERE id = $1 AND project_id = $2', [phaseId, projectId]);
  if (!result.rowCount) throw new AppError(404, 'Project phase unavailable.');
}

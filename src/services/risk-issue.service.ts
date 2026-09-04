import { pool } from '../db/connection';
import {
  createIssue,
  createRisk,
  deleteIssue,
  deleteRisk,
  findIssue,
  findRisk,
  listIssuesForProject,
  listRisksForProject,
  updateIssue,
  updateRisk,
} from '../db/repositories/risk-issue.repository';
import {
  listAllIssues,
  listAllRisks,
} from '../db/repositories/dashboard.repository';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isUuid } from '../utils/request.util';
import { requireAdmin, requireProjectAccess, requireProjectLead } from './project-access.service';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RISK_STATUSES = new Set(['open', 'mitigating', 'escalated', 'resolved']);
const ISSUE_STATUSES = new Set(['open', 'mitigating', 'escalated', 'resolved']);
const SEVERITY_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const PROBABILITY_LEVELS = new Set(['low', 'medium', 'high']);
const PRIORITY_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${field} is required.`);
  return value.trim();
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) throw new AppError(400, `${field} must be a valid ISO date.`);
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(400, 'Invalid text value.');
  return value.trim() || null;
}

function optionalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredDate(value, 'date');
}

function optionalIdentifier(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isUuid(value)) throw new AppError(400, 'Invalid identifier.');
  return value;
}

function requiredPercent(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) throw new AppError(400, `${field} must be between 0 and 100.`);
  return value;
}

async function requireExistingProject(projectId: string): Promise<void> {
  const result = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!result.rows[0]) throw new AppError(404, 'Project unavailable.');
}

async function validateOwnerMembership(projectId: string, ownerUserId: string | null): Promise<void> {
  if (ownerUserId === null) return;
  const result = await pool.query('SELECT 1 FROM project_memberships WHERE project_id = $1 AND user_id = $2', [projectId, ownerUserId]);
  if (!result.rows[0]) {
    throw new AppError(400, 'Owner must be a member of the project.');
  }
}

// --- Risks ---

export async function listAllProjectRisks(user: AuthenticatedUser) {
  const isAdmin = user.role === 'admin';
  return listAllRisks(user.id, isAdmin);
}

export async function listProjectRisks(user: AuthenticatedUser, projectId: string) {
  await requireProjectAccess(user, projectId);
  return listRisksForProject(projectId);
}

export async function createRiskRecord(user: AuthenticatedUser, projectId: string, body: unknown) {
  await requireProjectLead(user, projectId);
  await requireExistingProject(projectId);
  const input = body as Record<string, unknown>;
  const title = requiredText(input.title, 'title');
  const description = optionalText(input.description);
  const severity = input.severity as string;
  if (!SEVERITY_LEVELS.has(severity)) throw new AppError(400, 'Invalid severity level.');
  const probability = input.probability as string;
  if (!PROBABILITY_LEVELS.has(probability)) throw new AppError(400, 'Invalid probability level.');
  const ownerUserId = optionalIdentifier(input.owner_user_id);
  await validateOwnerMembership(projectId, ownerUserId);
  const dueDate = optionalDate(input.due_date);
  const status = input.status ?? 'open';
  if (!RISK_STATUSES.has(String(status))) throw new AppError(400, 'Invalid risk status.');
  const mitigationProgress = input.mitigation_progress === undefined ? 0 : requiredPercent(input.mitigation_progress, 'mitigation_progress');
  const mitigationNote = optionalText(input.mitigation_note);

  const riskId = await createRisk({
    projectId, title, description, severity, probability, ownerUserId, dueDate,
    status, mitigationProgress, mitigationNote, createdByUserId: user.id,
  });
  return findRisk(riskId);
}

export async function updateRiskRecord(user: AuthenticatedUser, riskId: string, body: unknown) {
  const existing = await findRisk(riskId);
  if (!existing) throw new AppError(404, 'Risk unavailable.');
  await requireProjectLead(user, String(existing.project_id));
  const input = body as Record<string, unknown>;
  const title = input.title === undefined ? String(existing.title) : requiredText(input.title, 'title');
  const description = input.description === undefined ? (existing.description as string) ?? null : optionalText(input.description);
  const severity = input.severity === undefined ? String(existing.severity) : String(input.severity);
  if (!SEVERITY_LEVELS.has(severity)) throw new AppError(400, 'Invalid severity level.');
  const probability = input.probability === undefined ? String(existing.probability) : String(input.probability);
  if (!PROBABILITY_LEVELS.has(probability)) throw new AppError(400, 'Invalid probability level.');
  const ownerUserId = input.owner_user_id === undefined ? (existing.owner_user_id as string) ?? null : optionalIdentifier(input.owner_user_id);
  await validateOwnerMembership(String(existing.project_id), ownerUserId);
  const dueDate = input.due_date === undefined ? (existing.due_date as string) ?? null : optionalDate(input.due_date);
  const status = input.status === undefined ? String(existing.status) : String(input.status);
  if (!RISK_STATUSES.has(status)) throw new AppError(400, 'Invalid risk status.');
  const mitigationProgress = input.mitigation_progress === undefined ? Number(existing.mitigation_progress) : requiredPercent(input.mitigation_progress, 'mitigation_progress');
  const mitigationNote = input.mitigation_note === undefined ? (existing.mitigation_note as string) ?? null : optionalText(input.mitigation_note);

  await updateRisk(riskId, { title, description, severity, probability, ownerUserId, dueDate, status, mitigationProgress, mitigationNote });
  return findRisk(riskId);
}

export async function deleteRiskRecord(user: AuthenticatedUser, riskId: string): Promise<void> {
  requireAdmin(user);
  const existing = await findRisk(riskId);
  if (!existing) throw new AppError(404, 'Risk unavailable.');
  await deleteRisk(riskId);
}

// --- Issues ---

export async function listAllProjectIssues(user: AuthenticatedUser) {
  const isAdmin = user.role === 'admin';
  return listAllIssues(user.id, isAdmin);
}

export async function listProjectIssues(user: AuthenticatedUser, projectId: string) {
  await requireProjectAccess(user, projectId);
  return listIssuesForProject(projectId);
}

export async function createIssueRecord(user: AuthenticatedUser, projectId: string, body: unknown) {
  await requireProjectLead(user, projectId);
  await requireExistingProject(projectId);
  const input = body as Record<string, unknown>;
  const title = requiredText(input.title, 'title');
  const description = optionalText(input.description);
  const priority = input.priority as string;
  if (!PRIORITY_LEVELS.has(priority)) throw new AppError(400, 'Invalid priority level.');
  const ownerUserId = optionalIdentifier(input.owner_user_id);
  await validateOwnerMembership(projectId, ownerUserId);
  const targetResolutionDate = optionalDate(input.target_resolution_date);
  const status = String(input.status ?? 'open');
  if (!ISSUE_STATUSES.has(status)) throw new AppError(400, 'Invalid issue status.');
  const resolutionProgress = input.resolution_progress === undefined ? 0 : requiredPercent(input.resolution_progress, 'resolution_progress');
  const resolutionNote = optionalText(input.resolution_note);

  const issueId = await createIssue({
    projectId, title, description, priority, ownerUserId, targetResolutionDate,
    status, resolutionProgress, resolutionNote, createdByUserId: user.id,
  });
  return findIssue(issueId);
}

export async function updateIssueRecord(user: AuthenticatedUser, issueId: string, body: unknown) {
  const existing = await findIssue(issueId);
  if (!existing) throw new AppError(404, 'Issue unavailable.');
  await requireProjectLead(user, String(existing.project_id));
  const input = body as Record<string, unknown>;
  const title = input.title === undefined ? String(existing.title) : requiredText(input.title, 'title');
  const description = input.description === undefined ? (existing.description as string) ?? null : optionalText(input.description);
  const priority = input.priority === undefined ? String(existing.priority) : String(input.priority);
  if (!PRIORITY_LEVELS.has(priority)) throw new AppError(400, 'Invalid priority level.');
  const ownerUserId = input.owner_user_id === undefined ? (existing.owner_user_id as string) ?? null : optionalIdentifier(input.owner_user_id);
  await validateOwnerMembership(String(existing.project_id), ownerUserId);
  const targetResolutionDate = input.target_resolution_date === undefined ? (existing.target_resolution_date as string) ?? null : optionalDate(input.target_resolution_date);
  const status = input.status === undefined ? String(existing.status) : String(input.status);
  if (!ISSUE_STATUSES.has(status)) throw new AppError(400, 'Invalid issue status.');
  const resolutionProgress = input.resolution_progress === undefined ? Number(existing.resolution_progress) : requiredPercent(input.resolution_progress, 'resolution_progress');
  const resolutionNote = input.resolution_note === undefined ? (existing.resolution_note as string) ?? null : optionalText(input.resolution_note);

  await updateIssue(issueId, { title, description, priority, ownerUserId, targetResolutionDate, status, resolutionProgress, resolutionNote });
  return findIssue(issueId);
}

export async function deleteIssueRecord(user: AuthenticatedUser, issueId: string): Promise<void> {
  requireAdmin(user);
  const existing = await findIssue(issueId);
  if (!existing) throw new AppError(404, 'Issue unavailable.');
  await deleteIssue(issueId);
}

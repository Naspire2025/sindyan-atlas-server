import { pool } from '../db/connection';
import { isProjectMember } from '../db/repositories/membership.repository';
import {
  createAsset,
  createAssetAllocation,
  createAvailability,
  createCapacityProfile,
  createMemberAllocation,
  deleteAsset,
  deleteAssetAllocation,
  deleteAvailability,
  deleteMemberAllocation,
  findAsset,
  findAssetAllocation,
  findAvailability,
  findCapacityProfile,
  findMemberAllocation,
  listAssets,
  listAssetAllocations,
  listAvailabilityForUser,
  listCapacityProfilesForUser,
  listMemberAllocations,
  updateAsset,
  updateAssetAllocation,
  updateAvailability,
  updateCapacityProfile,
  updateMemberAllocation,
  fetchWorkloadSummary,
  fetchProjectAllocations,
} from '../db/repositories/resource.repository';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isUuid, parseUuid } from '../utils/request.util';
import { requireAdmin, requireProjectAccess } from './project-access.service';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ASSET_STATUSES = new Set(['available', 'in_use', 'reserved', 'retired', 'unavailable']);
const AVAILABILITY_STATUSES = new Set(['available', 'unavailable', 'reduced_capacity']);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${field} is required.`);
  return value.trim();
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) throw new AppError(400, `${field} must be a valid ISO date.`);
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new AppError(400, `${field} must be a non-negative number.`);
  return value;
}

function requiredIdentifier(value: unknown, field: string): string {
  if (!isUuid(value)) throw new AppError(400, `${field} must be a valid UUID.`);
  return value;
}

function requiredPercent(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new AppError(400, `${field} must be between 0 and 100.`);
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

async function requireExistingUser(userId: string): Promise<void> {
  const result = await pool.query("SELECT id FROM users WHERE id = $1 AND status = 'active'", [userId]);
  if (!result.rows[0]) {
    throw new AppError(400, 'User must be an active user.');
  }
}

async function checkAllocationOverlap(_projectId: string, userId: string, startsOn: string, endsOn: string, allocationPercent: number, excludeId?: string): Promise<void> {
  const conditions: string[] = ['user_id = $1', 'starts_on <= $2', 'ends_on >= $3'];
  const parameters: unknown[] = [userId, endsOn, startsOn];
  if (excludeId) { conditions.push(`id != $${parameters.length + 1}`); parameters.push(excludeId); }
  const result = await pool.query(`SELECT COALESCE(SUM(allocation_percent), 0) AS total FROM project_member_allocations WHERE ${conditions.join(' AND ')}`, parameters);
  const existingPercent = (result.rows[0] as { total: number }).total;
  if (existingPercent + allocationPercent > 100) throw new AppError(409, 'Allocation exceeds the member\u2019s available capacity.');
}

async function checkAssetOverlap(assetId: string, startsOn: string, endsOn: string, allocationPercent: number, excludeId?: string): Promise<void> {
  const conditions: string[] = ['asset_id = $1', 'starts_on <= $2', 'ends_on >= $3'];
  const parameters: unknown[] = [assetId, endsOn, startsOn];
  if (excludeId) { conditions.push(`id != $${parameters.length + 1}`); parameters.push(excludeId); }
  const result = await pool.query(`SELECT COALESCE(SUM(allocation_percent), 0) AS total FROM asset_allocations WHERE ${conditions.join(' AND ')}`, parameters);
  const existingPercent = (result.rows[0] as { total: number }).total;
  if (existingPercent + allocationPercent > 100) throw new AppError(409, 'Allocation exceeds the asset\u2019s available capacity.');
}

// --- Capacity Profiles ---

export async function listUserCapacityProfiles(user: AuthenticatedUser, userId: string) {
  requireAdmin(user);
  await requireExistingUser(userId);
  return listCapacityProfilesForUser(userId);
}

export async function createCapacityProfileRecord(user: AuthenticatedUser, userId: string, body: unknown) {
  requireAdmin(user);
  await requireExistingUser(userId);
  const input = body as Record<string, unknown>;
  const effectiveFrom = requiredDate(input.effective_from, 'effective_from');
  const weeklyCapacityHours = requiredNumber(input.weekly_capacity_hours, 'weekly_capacity_hours');

  const profileId = await createCapacityProfile({ userId, effectiveFrom, weeklyCapacityHours, createdByUserId: user.id });
  return findCapacityProfile(profileId);
}

export async function updateCapacityProfileRecord(user: AuthenticatedUser, profileId: string, body: unknown) {
  requireAdmin(user);
  const existing = await findCapacityProfile(profileId);
  if (!existing) throw new AppError(404, 'Capacity profile unavailable.');
  const input = body as Record<string, unknown>;
  const weeklyCapacityHours = input.weekly_capacity_hours === undefined
    ? Number(existing.weekly_capacity_hours)
    : requiredNumber(input.weekly_capacity_hours, 'weekly_capacity_hours');

  await updateCapacityProfile(profileId, { weeklyCapacityHours });
  return findCapacityProfile(profileId);
}

// --- Availability ---

export async function listUserAvailability(user: AuthenticatedUser, userId: string) {
  requireAdmin(user);
  await requireExistingUser(userId);
  return listAvailabilityForUser(userId);
}

export async function createAvailabilityRecord(user: AuthenticatedUser, userId: string, body: unknown) {
  requireAdmin(user);
  await requireExistingUser(userId);
  const input = body as Record<string, unknown>;
  const startsOn = requiredDate(input.starts_on, 'starts_on');
  const endsOn = requiredDate(input.ends_on, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const capacityHours = requiredNumber(input.capacity_hours, 'capacity_hours');
  const availabilityStatus = input.availability_status as string;
  if (!AVAILABILITY_STATUSES.has(availabilityStatus)) throw new AppError(400, 'Invalid availability status.');
  const note = optionalText(input.note);

  const availabilityId = await createAvailability({ userId, startsOn, endsOn, capacityHours, availabilityStatus, note, createdByUserId: user.id });
  return findAvailability(availabilityId);
}

export async function updateAvailabilityRecord(user: AuthenticatedUser, availabilityId: string, body: unknown) {
  requireAdmin(user);
  const existing = await findAvailability(availabilityId);
  if (!existing) throw new AppError(404, 'Availability record unavailable.');
  const input = body as Record<string, unknown>;
  const startsOn = input.starts_on === undefined ? String(existing.starts_on) : requiredDate(input.starts_on, 'starts_on');
  const endsOn = input.ends_on === undefined ? String(existing.ends_on) : requiredDate(input.ends_on, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const capacityHours = input.capacity_hours === undefined ? Number(existing.capacity_hours) : requiredNumber(input.capacity_hours, 'capacity_hours');
  const availabilityStatus = input.availability_status === undefined ? String(existing.availability_status) : String(input.availability_status);
  if (!AVAILABILITY_STATUSES.has(availabilityStatus)) throw new AppError(400, 'Invalid availability status.');
  const note = input.note === undefined ? existing.note ?? null : optionalText(input.note);

  await updateAvailability(availabilityId, { startsOn, endsOn, capacityHours, availabilityStatus, note });
  return findAvailability(availabilityId);
}

export async function deleteAvailabilityRecord(user: AuthenticatedUser, availabilityId: string): Promise<void> {
  requireAdmin(user);
  const existing = await findAvailability(availabilityId);
  if (!existing) throw new AppError(404, 'Availability record unavailable.');
  await deleteAvailability(availabilityId);
}

// --- Member Allocations ---

export async function listMemberAllocationRecords(user: AuthenticatedUser, query: { project_id?: string; user_id?: string }) {
  requireAdmin(user);
  const filters: { projectId?: string; userId?: string } = {};
  if (query.project_id) filters.projectId = parseUuid(query.project_id, 'project_id must be a valid UUID.');
  if (query.user_id) filters.userId = parseUuid(query.user_id, 'user_id must be a valid UUID.');
  return listMemberAllocations(filters);
}

export async function createMemberAllocationRecord(user: AuthenticatedUser, body: unknown) {
  requireAdmin(user);
  const input = body as Record<string, unknown>;
  const projectId = requiredIdentifier(input.project_id, 'project_id');
  const userId = requiredIdentifier(input.user_id, 'user_id');
  const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!projectResult.rows[0]) throw new AppError(404, 'Project unavailable.');
  await requireExistingUser(userId);
  if (!await isProjectMember(userId, projectId)) throw new AppError(400, 'User must be a member of the project.');
  const startsOn = requiredDate(input.starts_on, 'starts_on');
  const endsOn = requiredDate(input.ends_on, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const allocationPercent = requiredPercent(input.allocation_percent, 'allocation_percent');
  const plannedHours = input.planned_hours === undefined ? null : requiredNumber(input.planned_hours, 'planned_hours');

  await checkAllocationOverlap(projectId, userId, startsOn, endsOn, allocationPercent);
  const allocationId = await createMemberAllocation({ projectId, userId, startsOn, endsOn, allocationPercent, plannedHours });
  return findMemberAllocation(allocationId);
}

export async function updateMemberAllocationRecord(user: AuthenticatedUser, allocationId: string, body: unknown) {
  requireAdmin(user);
  const existing = await findMemberAllocation(allocationId);
  if (!existing) throw new AppError(404, 'Member allocation unavailable.');
  const input = body as Record<string, unknown>;
  const startsOn = input.starts_on === undefined ? String(existing.starts_on) : requiredDate(input.starts_on, 'starts_on');
  const endsOn = input.ends_on === undefined ? String(existing.ends_on) : requiredDate(input.ends_on, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const allocationPercent = input.allocation_percent === undefined ? Number(existing.allocation_percent) : requiredPercent(input.allocation_percent, 'allocation_percent');
  const plannedHours = input.planned_hours === undefined ? existing.planned_hours ?? null : requiredNumber(input.planned_hours, 'planned_hours');

  await checkAllocationOverlap(String(existing.project_id), String(existing.user_id), startsOn, endsOn, allocationPercent, allocationId);
  await updateMemberAllocation(allocationId, { startsOn, endsOn, allocationPercent, plannedHours });
  return findMemberAllocation(allocationId);
}

export async function deleteMemberAllocationRecord(user: AuthenticatedUser, allocationId: string): Promise<void> {
  requireAdmin(user);
  const existing = await findMemberAllocation(allocationId);
  if (!existing) throw new AppError(404, 'Member allocation unavailable.');
  await deleteMemberAllocation(allocationId);
}

// --- Assets ---

export async function listAssetRecords(user: AuthenticatedUser) {
  requireAdmin(user);
  return listAssets();
}

export async function createAssetRecord(user: AuthenticatedUser, body: unknown) {
  requireAdmin(user);
  const input = body as Record<string, unknown>;
  const name = requiredText(input.name, 'name');
  const assetType = requiredText(input.asset_type, 'asset_type');
  const status = String(input.status ?? 'available');
  if (!ASSET_STATUSES.has(status)) throw new AppError(400, 'Invalid asset status.');
  const capacityDescription = optionalText(input.capacity_description);

  const assetId = await createAsset({ name, assetType, status, capacityDescription });
  return findAsset(assetId);
}

export async function updateAssetRecord(user: AuthenticatedUser, assetId: string, body: unknown) {
  requireAdmin(user);
  const existing = await findAsset(assetId);
  if (!existing) throw new AppError(404, 'Asset unavailable.');
  const input = body as Record<string, unknown>;
  const name = input.name === undefined ? String(existing.name) : requiredText(input.name, 'name');
  const assetType = input.asset_type === undefined ? String(existing.asset_type) : requiredText(input.asset_type, 'asset_type');
  const status = input.status === undefined ? String(existing.status) : String(input.status);
  if (!ASSET_STATUSES.has(status)) throw new AppError(400, 'Invalid asset status.');
  const capacityDescription = input.capacity_description === undefined ? existing.capacity_description ?? null : optionalText(input.capacity_description);

  await updateAsset(assetId, { name, assetType, status, capacityDescription });
  return findAsset(assetId);
}

export async function deleteAssetRecord(user: AuthenticatedUser, assetId: string): Promise<void> {
  requireAdmin(user);
  const existing = await findAsset(assetId);
  if (!existing) throw new AppError(404, 'Asset unavailable.');
  await deleteAsset(assetId);
}

// --- Asset Allocations ---

export async function listAssetAllocationRecords(user: AuthenticatedUser, query: { asset_id?: string; project_id?: string }) {
  requireAdmin(user);
  const filters: { assetId?: string; projectId?: string } = {};
  if (query.asset_id) filters.assetId = parseUuid(query.asset_id, 'asset_id must be a valid UUID.');
  if (query.project_id) filters.projectId = parseUuid(query.project_id, 'project_id must be a valid UUID.');
  return listAssetAllocations(filters);
}

export async function createAssetAllocationRecord(user: AuthenticatedUser, body: unknown) {
  requireAdmin(user);
  const input = body as Record<string, unknown>;
  const assetId = requiredIdentifier(input.asset_id, 'asset_id');
  const projectId = requiredIdentifier(input.project_id, 'project_id');
  const asset = await findAsset(assetId);
  if (!asset) throw new AppError(404, 'Asset unavailable.');
  if (asset.status === 'retired' || asset.status === 'unavailable') {
    throw new AppError(400, 'Cannot allocate a retired or unavailable asset.');
  }
  const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!projectResult.rows[0]) throw new AppError(404, 'Project unavailable.');
  const startsOn = requiredDate(input.starts_on, 'starts_on');
  const endsOn = requiredDate(input.ends_on, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const allocationPercent = requiredPercent(input.allocation_percent, 'allocation_percent');
  const note = optionalText(input.note);

  await checkAssetOverlap(assetId, startsOn, endsOn, allocationPercent);
  const allocationId = await createAssetAllocation({ assetId, projectId, startsOn, endsOn, allocationPercent, note, createdByUserId: user.id });
  return findAssetAllocation(allocationId);
}

export async function updateAssetAllocationRecord(user: AuthenticatedUser, allocationId: string, body: unknown) {
  requireAdmin(user);
  const existing = await findAssetAllocation(allocationId);
  if (!existing) throw new AppError(404, 'Asset allocation unavailable.');
  const input = body as Record<string, unknown>;
  const startsOn = input.starts_on === undefined ? String(existing.starts_on) : requiredDate(input.starts_on, 'starts_on');
  const endsOn = input.ends_on === undefined ? String(existing.ends_on) : requiredDate(input.ends_on, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const allocationPercent = input.allocation_percent === undefined ? Number(existing.allocation_percent) : requiredPercent(input.allocation_percent, 'allocation_percent');
  const note = input.note === undefined ? existing.note ?? null : optionalText(input.note);

  await checkAssetOverlap(String(existing.asset_id), startsOn, endsOn, allocationPercent, allocationId);
  await updateAssetAllocation(allocationId, { startsOn, endsOn, allocationPercent, note });
  return findAssetAllocation(allocationId);
}

export async function deleteAssetAllocationRecord(user: AuthenticatedUser, allocationId: string): Promise<void> {
  requireAdmin(user);
  const existing = await findAssetAllocation(allocationId);
  if (!existing) throw new AppError(404, 'Asset allocation unavailable.');
  await deleteAssetAllocation(allocationId);
}

// --- Workload ---

export async function getWorkloadView(user: AuthenticatedUser) {
  requireAdmin(user);
  return fetchWorkloadSummary();
}

export async function getProjectAllocationView(user: AuthenticatedUser, projectId: string) {
  await requireProjectAccess(user, projectId);
  return fetchProjectAllocations(projectId);
}

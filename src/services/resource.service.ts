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
  listAllAvailability,
  listAssets,
  listAssetAllocations,
  listAvailabilityForUser,
  listCapacityProfilesForUser,
  listAllCapacityProfiles,
  listMemberAllocations,
  updateAsset,
  updateAssetAllocation,
  updateAvailability,
  updateCapacityProfile,
  updateMemberAllocation,
  fetchWorkloadSummary,
  fetchProjectWorkloadSummary,
  fetchProjectAllocations,
} from '../db/repositories/resource.repository';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isUuid, parseUuid } from '../utils/request.util';
import { requireAdmin, requireProjectAccess } from './project-access.service';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ASSET_STATUSES = new Set(['available', 'in_use', 'reserved', 'retired', 'unavailable']);
const AVAILABILITY_STATUSES = new Set(['available', 'unavailable', 'reduced_capacity']);
const FULL_CAPACITY_PERCENTAGE = 100;

const ALLOCATION_SOURCES = {
  asset: { tableName: 'asset_allocations', ownerColumn: 'asset_id' },
  member: { tableName: 'project_member_allocations', ownerColumn: 'user_id' },
} as const;

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

async function getPeakAllocationPercentage(
  allocationType: keyof typeof ALLOCATION_SOURCES,
  ownerId: string,
  startsOn: string,
  endsOn: string,
  excludeId?: string,
): Promise<number> {
  const { tableName, ownerColumn } = ALLOCATION_SOURCES[allocationType];
  const parameters: unknown[] = [ownerId, startsOn, endsOn];
  const excludeCondition = excludeId ? `AND id != $${parameters.push(excludeId)}` : '';
  const result = await pool.query(
    `WITH relevant_allocations AS (
       SELECT
         GREATEST(starts_on::date, $2::date) AS starts_on,
         LEAST(ends_on::date, $3::date) AS ends_on,
         allocation_percent
       FROM ${tableName}
       WHERE ${ownerColumn} = $1
         AND starts_on <= $3
         AND ends_on >= $2
         ${excludeCondition}
     ), allocation_events AS (
       SELECT starts_on AS event_date, allocation_percent AS percentage_change FROM relevant_allocations
       UNION ALL
       SELECT ends_on + 1 AS event_date, -allocation_percent AS percentage_change FROM relevant_allocations
     ), concurrent_allocations AS (
       SELECT SUM(SUM(percentage_change)) OVER (ORDER BY event_date) AS total_percentage
       FROM allocation_events
       GROUP BY event_date
     )
     SELECT COALESCE(MAX(total_percentage), 0) AS peak_percentage
     FROM concurrent_allocations`,
    parameters,
  );
  return Number((result.rows[0] as { peak_percentage: number | string }).peak_percentage);
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
}

async function requireAvailableAllocationCapacity(
  allocationType: keyof typeof ALLOCATION_SOURCES,
  ownerId: string,
  startsOn: string,
  endsOn: string,
  allocationPercentage: number,
  excludeId?: string,
): Promise<void> {
  const peakPercentage = await getPeakAllocationPercentage(allocationType, ownerId, startsOn, endsOn, excludeId);
  const resultingPercentage = peakPercentage + allocationPercentage;
  if (resultingPercentage <= FULL_CAPACITY_PERCENTAGE) return;

  const ownerLabel = allocationType === 'member' ? 'Member' : 'Asset';
  throw new AppError(
    409,
    `${ownerLabel} is already allocated up to ${formatPercentage(peakPercentage)}% during these dates. ` +
    `This allocation would bring the total to ${formatPercentage(resultingPercentage)}%.`,
  );
}

// --- Capacity Profiles ---

export async function listAllCapacityProfileRecords(user: AuthenticatedUser) {
  requireAdmin(user);
  return listAllCapacityProfiles();
}

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

  try {
    const profileId = await createCapacityProfile({ userId, effectiveFrom, weeklyCapacityHours, createdByUserId: user.id });
    return findCapacityProfile(profileId);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'A capacity profile already exists for this effective date.');
    }
    throw error;
  }
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

export async function listAllAvailabilityRecords(user: AuthenticatedUser) {
  requireAdmin(user);
  return listAllAvailability();
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
  const projectId = requiredIdentifier(input.project_id || input.projectId, 'project_id');
  const userId = requiredIdentifier(input.user_id || input.userId, 'user_id');
  const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!projectResult.rows[0]) throw new AppError(404, 'Project unavailable.');
  await requireExistingUser(userId);
  if (!(await isProjectMember(userId, projectId))) {
    await pool.query(
      `INSERT INTO project_memberships (project_id, user_id, project_role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [projectId, userId],
    );
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const next90DaysStr = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const rawStartsOn = input.starts_on || input.startsOn;
  const rawEndsOn = input.ends_on || input.endsOn;
  const startsOn = rawStartsOn ? requiredDate(rawStartsOn, 'starts_on') : todayStr;
  const endsOn = rawEndsOn ? requiredDate(rawEndsOn, 'ends_on') : next90DaysStr;
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const rawPercent = input.allocation_percent ?? input.allocation_percentage ?? input.percentage;
  const allocationPercent = requiredPercent(rawPercent, 'allocation_percent');

  await requireAvailableAllocationCapacity('member', userId, startsOn, endsOn, allocationPercent);
  const allocationId = await createMemberAllocation({ projectId, userId, startsOn, endsOn, allocationPercent });
  return findMemberAllocation(allocationId);
}

export async function updateMemberAllocationRecord(user: AuthenticatedUser, allocationId: string, body: unknown) {
  requireAdmin(user);
  const existing = await findMemberAllocation(allocationId);
  if (!existing) throw new AppError(404, 'Member allocation unavailable.');
  const input = body as Record<string, unknown>;
  const rawStartsOn = input.starts_on || input.startsOn;
  const rawEndsOn = input.ends_on || input.endsOn;
  const startsOn = rawStartsOn === undefined ? String(existing.starts_on) : requiredDate(rawStartsOn, 'starts_on');
  const endsOn = rawEndsOn === undefined ? String(existing.ends_on) : requiredDate(rawEndsOn, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const rawPercent = input.allocation_percent ?? input.allocation_percentage ?? input.percentage;
  const allocationPercent = rawPercent === undefined ? Number(existing.allocation_percent) : requiredPercent(rawPercent, 'allocation_percent');

  await requireAvailableAllocationCapacity('member', String(existing.user_id), startsOn, endsOn, allocationPercent, allocationId);
  await updateMemberAllocation(allocationId, { startsOn, endsOn, allocationPercent });
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
  const assetId = requiredIdentifier(input.asset_id || input.assetId, 'asset_id');
  const projectId = requiredIdentifier(input.project_id || input.projectId, 'project_id');
  const asset = await findAsset(assetId);
  if (!asset) throw new AppError(404, 'Asset unavailable.');
  if (asset.status === 'retired' || asset.status === 'unavailable') {
    throw new AppError(400, 'Cannot allocate a retired or unavailable asset.');
  }
  const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!projectResult.rows[0]) throw new AppError(404, 'Project unavailable.');
  const todayStr = new Date().toISOString().slice(0, 10);
  const next90DaysStr = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const rawStartsOn = input.starts_on || input.startsOn;
  const rawEndsOn = input.ends_on || input.endsOn;
  const startsOn = rawStartsOn ? requiredDate(rawStartsOn, 'starts_on') : todayStr;
  const endsOn = rawEndsOn ? requiredDate(rawEndsOn, 'ends_on') : next90DaysStr;
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const rawPercent = input.allocation_percent ?? input.allocation_percentage ?? input.percentage;
  const allocationPercent = requiredPercent(rawPercent, 'allocation_percent');
  const note = optionalText(input.note);

  await requireAvailableAllocationCapacity('asset', assetId, startsOn, endsOn, allocationPercent);
  const allocationId = await createAssetAllocation({ assetId, projectId, startsOn, endsOn, allocationPercent, note, createdByUserId: user.id });
  return findAssetAllocation(allocationId);
}

export async function updateAssetAllocationRecord(user: AuthenticatedUser, allocationId: string, body: unknown) {
  requireAdmin(user);
  const existing = await findAssetAllocation(allocationId);
  if (!existing) throw new AppError(404, 'Asset allocation unavailable.');
  const input = body as Record<string, unknown>;
  const rawStartsOn = input.starts_on || input.startsOn;
  const rawEndsOn = input.ends_on || input.endsOn;
  const startsOn = rawStartsOn === undefined ? String(existing.starts_on) : requiredDate(rawStartsOn, 'starts_on');
  const endsOn = rawEndsOn === undefined ? String(existing.ends_on) : requiredDate(rawEndsOn, 'ends_on');
  if (endsOn < startsOn) throw new AppError(400, 'ends_on must not be before starts_on.');
  const rawPercent = input.allocation_percent ?? input.allocation_percentage ?? input.percentage;
  const allocationPercent = rawPercent === undefined ? Number(existing.allocation_percent) : requiredPercent(rawPercent, 'allocation_percent');
  const note = input.note === undefined ? existing.note ?? null : optionalText(input.note);

  await requireAvailableAllocationCapacity('asset', String(existing.asset_id), startsOn, endsOn, allocationPercent, allocationId);
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

export async function getWorkloadView(user: AuthenticatedUser, query: { starts_on?: string; ends_on?: string }) {
  requireAdmin(user);
  const dateRange: { startsOn?: string; endsOn?: string } = {};
  if (query.starts_on) dateRange.startsOn = requiredDate(query.starts_on, 'starts_on');
  if (query.ends_on) dateRange.endsOn = requiredDate(query.ends_on, 'ends_on');
  return fetchWorkloadSummary(dateRange.startsOn || dateRange.endsOn ? dateRange : undefined);
}

export async function getProjectWorkloadView(user: AuthenticatedUser, projectId: string, query: { starts_on?: string; ends_on?: string }) {
  await requireProjectAccess(user, projectId);
  const dateRange: { startsOn?: string; endsOn?: string } = {};
  if (query.starts_on) dateRange.startsOn = requiredDate(query.starts_on, 'starts_on');
  if (query.ends_on) dateRange.endsOn = requiredDate(query.ends_on, 'ends_on');
  return fetchProjectWorkloadSummary(projectId, dateRange.startsOn || dateRange.endsOn ? dateRange : undefined);
}

export async function getProjectAllocationView(user: AuthenticatedUser, projectId: string) {
  await requireProjectAccess(user, projectId);
  return fetchProjectAllocations(projectId);
}

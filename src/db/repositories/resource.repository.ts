import { pool } from '../connection';

export type CapacityProfileRow = Record<string, unknown> & { id: number; user_id: number };
export type AvailabilityRow = Record<string, unknown> & { id: number; user_id: number };
export type MemberAllocationRow = Record<string, unknown> & { id: number; project_id: number; user_id: number };
export type AssetRow = Record<string, unknown> & { id: number };
export type AssetAllocationRow = Record<string, unknown> & { id: number; asset_id: number; project_id: number };

export async function findCapacityProfile(profileId: number): Promise<CapacityProfileRow | undefined> {
  const result = await pool.query('SELECT * FROM member_capacity_profiles WHERE id = $1', [profileId]);
  return result.rows[0] as CapacityProfileRow | undefined;
}

export async function listCapacityProfilesForUser(userId: number): Promise<CapacityProfileRow[]> {
  const result = await pool.query(
    'SELECT * FROM member_capacity_profiles WHERE user_id = $1 ORDER BY effective_from DESC, id DESC',
    [userId],
  );
  return result.rows as CapacityProfileRow[];
}

export async function createCapacityProfile(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(
    `INSERT INTO member_capacity_profiles (user_id, effective_from, weekly_capacity_hours, created_by_user_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.userId, input.effectiveFrom, input.weeklyCapacityHours, input.createdByUserId],
  );
  return result.rows[0].id as number;
}

export async function updateCapacityProfile(profileId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE member_capacity_profiles
     SET weekly_capacity_hours = $1, updated_at = NOW()
     WHERE id = $2`,
    [input.weeklyCapacityHours, profileId],
  );
}

export async function findAvailability(availabilityId: number): Promise<AvailabilityRow | undefined> {
  const result = await pool.query('SELECT * FROM member_availability WHERE id = $1', [availabilityId]);
  return result.rows[0] as AvailabilityRow | undefined;
}

export async function listAvailabilityForUser(userId: number): Promise<AvailabilityRow[]> {
  const result = await pool.query(
    'SELECT * FROM member_availability WHERE user_id = $1 ORDER BY starts_on ASC, id ASC',
    [userId],
  );
  return result.rows as AvailabilityRow[];
}

export async function createAvailability(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(
    `INSERT INTO member_availability (user_id, starts_on, ends_on, capacity_hours, availability_status, note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.userId, input.startsOn, input.endsOn, input.capacityHours, input.availabilityStatus, input.note, input.createdByUserId],
  );
  return result.rows[0].id as number;
}

export async function updateAvailability(availabilityId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE member_availability
     SET starts_on = $1, ends_on = $2, capacity_hours = $3,
         availability_status = $4, note = $5
     WHERE id = $6`,
    [input.startsOn, input.endsOn, input.capacityHours, input.availabilityStatus, input.note, availabilityId],
  );
}

export async function deleteAvailability(availabilityId: number): Promise<void> {
  await pool.query('DELETE FROM member_availability WHERE id = $1', [availabilityId]);
}

export async function findMemberAllocation(allocationId: number): Promise<MemberAllocationRow | undefined> {
  const result = await pool.query('SELECT * FROM project_member_allocations WHERE id = $1', [allocationId]);
  return result.rows[0] as MemberAllocationRow | undefined;
}

export async function listMemberAllocations(filters: { projectId?: number; userId?: number }): Promise<MemberAllocationRow[]> {
  const conditions: string[] = [];
  const parameters: unknown[] = [];
  let paramIndex = 1;
  if (filters.projectId) { conditions.push(`project_id = $${paramIndex++}`); parameters.push(filters.projectId); }
  if (filters.userId) { conditions.push(`user_id = $${paramIndex++}`); parameters.push(filters.userId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM project_member_allocations ${where} ORDER BY starts_on ASC, id ASC`,
    parameters,
  );
  return result.rows as MemberAllocationRow[];
}

export async function createMemberAllocation(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(
    `INSERT INTO project_member_allocations (project_id, user_id, starts_on, ends_on, allocation_percent, planned_hours)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.projectId, input.userId, input.startsOn, input.endsOn, input.allocationPercent, input.plannedHours],
  );
  return result.rows[0].id as number;
}

export async function updateMemberAllocation(allocationId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE project_member_allocations
     SET starts_on = $1, ends_on = $2, allocation_percent = $3,
         planned_hours = $4, updated_at = NOW()
     WHERE id = $5`,
    [input.startsOn, input.endsOn, input.allocationPercent, input.plannedHours, allocationId],
  );
}

export async function deleteMemberAllocation(allocationId: number): Promise<void> {
  await pool.query('DELETE FROM project_member_allocations WHERE id = $1', [allocationId]);
}

export async function findAsset(assetId: number): Promise<AssetRow | undefined> {
  const result = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
  return result.rows[0] as AssetRow | undefined;
}

export async function listAssets(): Promise<AssetRow[]> {
  const result = await pool.query('SELECT * FROM assets ORDER BY name ASC, id ASC');
  return result.rows as AssetRow[];
}

export async function createAsset(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(
    `INSERT INTO assets (name, asset_type, status, capacity_description)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.name, input.assetType, input.status, input.capacityDescription],
  );
  return result.rows[0].id as number;
}

export async function updateAsset(assetId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE assets
     SET name = $1, asset_type = $2, status = $3,
         capacity_description = $4, updated_at = NOW()
     WHERE id = $5`,
    [input.name, input.assetType, input.status, input.capacityDescription, assetId],
  );
}

export async function deleteAsset(assetId: number): Promise<void> {
  await pool.query('DELETE FROM assets WHERE id = $1', [assetId]);
}

export async function findAssetAllocation(allocationId: number): Promise<AssetAllocationRow | undefined> {
  const result = await pool.query('SELECT * FROM asset_allocations WHERE id = $1', [allocationId]);
  return result.rows[0] as AssetAllocationRow | undefined;
}

export async function listAssetAllocations(filters: { assetId?: number; projectId?: number }): Promise<AssetAllocationRow[]> {
  const conditions: string[] = [];
  const parameters: unknown[] = [];
  let paramIndex = 1;
  if (filters.assetId) { conditions.push(`asset_id = $${paramIndex++}`); parameters.push(filters.assetId); }
  if (filters.projectId) { conditions.push(`project_id = $${paramIndex++}`); parameters.push(filters.projectId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM asset_allocations ${where} ORDER BY starts_on ASC, id ASC`,
    parameters,
  );
  return result.rows as AssetAllocationRow[];
}

export async function createAssetAllocation(input: Record<string, unknown>): Promise<number> {
  const result = await pool.query(
    `INSERT INTO asset_allocations (asset_id, project_id, starts_on, ends_on, allocation_percent, note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.assetId, input.projectId, input.startsOn, input.endsOn, input.allocationPercent, input.note, input.createdByUserId],
  );
  return result.rows[0].id as number;
}

export async function updateAssetAllocation(allocationId: number, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE asset_allocations
     SET starts_on = $1, ends_on = $2, allocation_percent = $3, note = $4
     WHERE id = $5`,
    [input.startsOn, input.endsOn, input.allocationPercent, input.note, allocationId],
  );
}

export async function deleteAssetAllocation(allocationId: number): Promise<void> {
  await pool.query('DELETE FROM asset_allocations WHERE id = $1', [allocationId]);
}

export async function fetchWorkloadSummary(): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(`
    SELECT
      u.id AS user_id, u.name AS user_name,
      COUNT(DISTINCT pa.project_id) AS allocated_projects,
      COALESCE(SUM(pa.allocation_percent), 0) AS total_allocation_percent
    FROM users u
    LEFT JOIN project_member_allocations pa ON pa.user_id = u.id AND pa.starts_on <= CURRENT_DATE::text AND pa.ends_on >= CURRENT_DATE::text
    WHERE u.status = 'active'
    GROUP BY u.id
    ORDER BY u.name
  `);
  return result.rows as Array<Record<string, unknown>>;
}

export async function fetchProjectAllocations(projectId: number): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    `SELECT pa.*, u.name AS user_name
     FROM project_member_allocations pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.project_id = $1
     ORDER BY pa.starts_on ASC, pa.id ASC`,
    [projectId],
  );
  return result.rows as Array<Record<string, unknown>>;
}

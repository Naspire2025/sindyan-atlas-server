import { pool } from '../connection';

export type CapacityProfileRow = Record<string, unknown> & { id: string; user_id: string };
export type AvailabilityRow = Record<string, unknown> & { id: string; user_id: string };
export type MemberAllocationRow = Record<string, unknown> & { id: string; project_id: string; user_id: string };
export type AssetRow = Record<string, unknown> & { id: string };
export type AssetAllocationRow = Record<string, unknown> & { id: string; asset_id: string; project_id: string };

export async function findCapacityProfile(profileId: string): Promise<CapacityProfileRow | undefined> {
  const result = await pool.query('SELECT * FROM member_capacity_profiles WHERE id = $1', [profileId]);
  return result.rows[0] as CapacityProfileRow | undefined;
}

export async function listCapacityProfilesForUser(userId: string): Promise<CapacityProfileRow[]> {
  const result = await pool.query(
    'SELECT * FROM member_capacity_profiles WHERE user_id = $1 ORDER BY effective_from DESC, id DESC',
    [userId],
  );
  return result.rows as CapacityProfileRow[];
}

export async function listAllCapacityProfiles(): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    `SELECT cp.*, u.name AS user_name, u.email_display AS user_email
     FROM member_capacity_profiles cp
     LEFT JOIN users u ON u.id = cp.user_id
     ORDER BY u.name ASC, cp.effective_from DESC, cp.id ASC`,
  );
  return result.rows as Array<Record<string, unknown>>;
}

export async function createCapacityProfile(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(
    `INSERT INTO member_capacity_profiles (user_id, effective_from, weekly_capacity_hours, created_by_user_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.userId, input.effectiveFrom, input.weeklyCapacityHours, input.createdByUserId],
  );
  return result.rows[0].id as string;
}

export async function updateCapacityProfile(profileId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE member_capacity_profiles
     SET weekly_capacity_hours = $1, updated_at = NOW()
     WHERE id = $2`,
    [input.weeklyCapacityHours, profileId],
  );
}

export async function findAvailability(availabilityId: string): Promise<AvailabilityRow | undefined> {
  const result = await pool.query('SELECT * FROM member_availability WHERE id = $1', [availabilityId]);
  return result.rows[0] as AvailabilityRow | undefined;
}

export async function listAvailabilityForUser(userId: string): Promise<AvailabilityRow[]> {
  const result = await pool.query(
    'SELECT * FROM member_availability WHERE user_id = $1 ORDER BY starts_on ASC, id ASC',
    [userId],
  );
  return result.rows as AvailabilityRow[];
}

export async function createAvailability(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(
    `INSERT INTO member_availability (user_id, starts_on, ends_on, capacity_hours, availability_status, note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.userId, input.startsOn, input.endsOn, input.capacityHours, input.availabilityStatus, input.note, input.createdByUserId],
  );
  return result.rows[0].id as string;
}

export async function updateAvailability(availabilityId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE member_availability
     SET starts_on = $1, ends_on = $2, capacity_hours = $3,
         availability_status = $4, note = $5
     WHERE id = $6`,
    [input.startsOn, input.endsOn, input.capacityHours, input.availabilityStatus, input.note, availabilityId],
  );
}

export async function deleteAvailability(availabilityId: string): Promise<void> {
  await pool.query('DELETE FROM member_availability WHERE id = $1', [availabilityId]);
}

export async function findMemberAllocation(allocationId: string): Promise<MemberAllocationRow | undefined> {
  const result = await pool.query(
    `SELECT pma.*, pma.allocation_percent AS allocation_percentage, pma.allocation_percent AS percentage,
            u.name AS user_name, u.email_display AS user_email, p.name AS project_name
     FROM project_member_allocations pma
     LEFT JOIN users u ON u.id = pma.user_id
     LEFT JOIN projects p ON p.id = pma.project_id
     WHERE pma.id = $1`,
    [allocationId],
  );
  return result.rows[0] as MemberAllocationRow | undefined;
}

export async function listMemberAllocations(filters: { projectId?: string; userId?: string }): Promise<MemberAllocationRow[]> {
  const conditions: string[] = [];
  const parameters: unknown[] = [];
  let paramIndex = 1;
  if (filters.projectId) { conditions.push(`pma.project_id = $${paramIndex++}`); parameters.push(filters.projectId); }
  if (filters.userId) { conditions.push(`pma.user_id = $${paramIndex++}`); parameters.push(filters.userId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT pma.*, pma.allocation_percent AS allocation_percentage, pma.allocation_percent AS percentage,
            u.name AS user_name, u.email_display AS user_email, p.name AS project_name
     FROM project_member_allocations pma
     LEFT JOIN users u ON u.id = pma.user_id
     LEFT JOIN projects p ON p.id = pma.project_id
     ${where}
     ORDER BY pma.starts_on ASC, pma.id ASC`,
    parameters,
  );
  return result.rows as MemberAllocationRow[];
}

export async function createMemberAllocation(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(
    `INSERT INTO project_member_allocations (project_id, user_id, starts_on, ends_on, allocation_percent, planned_hours)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.projectId, input.userId, input.startsOn, input.endsOn, input.allocationPercent, input.plannedHours],
  );
  return result.rows[0].id as string;
}

export async function updateMemberAllocation(allocationId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE project_member_allocations
     SET starts_on = $1, ends_on = $2, allocation_percent = $3,
         planned_hours = $4, updated_at = NOW()
     WHERE id = $5`,
    [input.startsOn, input.endsOn, input.allocationPercent, input.plannedHours, allocationId],
  );
}

export async function deleteMemberAllocation(allocationId: string): Promise<void> {
  await pool.query('DELETE FROM project_member_allocations WHERE id = $1', [allocationId]);
}

export async function findAsset(assetId: string): Promise<AssetRow | undefined> {
  const result = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
  return result.rows[0] as AssetRow | undefined;
}

export async function listAssets(): Promise<AssetRow[]> {
  const result = await pool.query('SELECT * FROM assets ORDER BY name ASC, id ASC');
  return result.rows as AssetRow[];
}

export async function createAsset(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(
    `INSERT INTO assets (name, asset_type, status, capacity_description)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.name, input.assetType, input.status, input.capacityDescription],
  );
  return result.rows[0].id as string;
}

export async function updateAsset(assetId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE assets
     SET name = $1, asset_type = $2, status = $3,
         capacity_description = $4, updated_at = NOW()
     WHERE id = $5`,
    [input.name, input.assetType, input.status, input.capacityDescription, assetId],
  );
}

export async function deleteAsset(assetId: string): Promise<void> {
  await pool.query('DELETE FROM assets WHERE id = $1', [assetId]);
}

export async function findAssetAllocation(allocationId: string): Promise<AssetAllocationRow | undefined> {
  const result = await pool.query(
    `SELECT aa.*, aa.allocation_percent AS allocation_percentage, aa.allocation_percent AS percentage,
            a.name AS asset_name, p.name AS project_name
     FROM asset_allocations aa
     LEFT JOIN assets a ON a.id = aa.asset_id
     LEFT JOIN projects p ON p.id = aa.project_id
     WHERE aa.id = $1`,
    [allocationId],
  );
  return result.rows[0] as AssetAllocationRow | undefined;
}

export async function listAssetAllocations(filters: { assetId?: string; projectId?: string }): Promise<AssetAllocationRow[]> {
  const conditions: string[] = [];
  const parameters: unknown[] = [];
  let paramIndex = 1;
  if (filters.assetId) { conditions.push(`aa.asset_id = $${paramIndex++}`); parameters.push(filters.assetId); }
  if (filters.projectId) { conditions.push(`aa.project_id = $${paramIndex++}`); parameters.push(filters.projectId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT aa.*, aa.allocation_percent AS allocation_percentage, aa.allocation_percent AS percentage,
            a.name AS asset_name, p.name AS project_name
     FROM asset_allocations aa
     LEFT JOIN assets a ON a.id = aa.asset_id
     LEFT JOIN projects p ON p.id = aa.project_id
     ${where}
     ORDER BY aa.starts_on ASC, aa.id ASC`,
    parameters,
  );
  return result.rows as AssetAllocationRow[];
}

export async function createAssetAllocation(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(
    `INSERT INTO asset_allocations (asset_id, project_id, starts_on, ends_on, allocation_percent, note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.assetId, input.projectId, input.startsOn, input.endsOn, input.allocationPercent, input.note, input.createdByUserId],
  );
  return result.rows[0].id as string;
}

export async function updateAssetAllocation(allocationId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE asset_allocations
     SET starts_on = $1, ends_on = $2, allocation_percent = $3, note = $4
     WHERE id = $5`,
    [input.startsOn, input.endsOn, input.allocationPercent, input.note, allocationId],
  );
}

export async function deleteAssetAllocation(allocationId: string): Promise<void> {
  await pool.query('DELETE FROM asset_allocations WHERE id = $1', [allocationId]);
}

export async function fetchWorkloadSummary(dateRange?: { startsOn?: string; endsOn?: string }): Promise<Array<Record<string, unknown>>> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const startsOn = dateRange?.startsOn || todayStr;
  const endsOn = dateRange?.endsOn || todayStr;

  const result = await pool.query(`
    WITH latest_capacity AS (
      SELECT DISTINCT ON (user_id) user_id, weekly_capacity_hours
      FROM member_capacity_profiles
      ORDER BY user_id, effective_from DESC
    ),
    availability_reduction AS (
      SELECT
        av.user_id,
        COALESCE(
          SUM(
            LEAST (av.ends_on, $2::text) :: date
            - GREATEST (av.starts_on, $1::text) :: date
            + 1
          ) * av.capacity_hours / 7.0,
          0.0
        ) AS unavailable_hours
      FROM member_availability av
      WHERE av.starts_on <= $2 AND av.ends_on >= $1
        AND av.availability_status IN ('unavailable', 'reduced_capacity')
      GROUP BY av.user_id, av.capacity_hours
    )
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email_display AS email,
      COALESCE(lc.weekly_capacity_hours, 40) AS capacity_hours,
      ROUND(
        COALESCE(SUM(pa.allocation_percent), 0.0) / 100.0
          * COALESCE(lc.weekly_capacity_hours, 40)
          * GREATEST(1.0, ((LEAST(pa.ends_on, $2) :: date - GREATEST(pa.starts_on, $1) :: date + 1) / 7.0) :: double precision)
          - COALESCE(ar.unavailable_hours, 0.0),
        1
      ) AS allocated_hours,
      COUNT(DISTINCT pa.project_id) AS allocated_projects
    FROM users u
    LEFT JOIN latest_capacity lc ON lc.user_id = u.id
    LEFT JOIN project_member_allocations pa
      ON pa.user_id = u.id AND pa.starts_on <= $2 AND pa.ends_on >= $1
    LEFT JOIN availability_reduction ar ON ar.user_id = u.id
    WHERE u.status = 'active'
    GROUP BY u.id, u.name, u.email_display, lc.weekly_capacity_hours, ar.unavailable_hours
    ORDER BY u.name
  `, [startsOn, endsOn]);
  return result.rows as Array<Record<string, unknown>>;
}

export async function fetchProjectWorkloadSummary(projectId: string, dateRange?: { startsOn?: string; endsOn?: string }): Promise<Array<Record<string, unknown>>> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const startsOn = dateRange?.startsOn || todayStr;
  const endsOn = dateRange?.endsOn || todayStr;

  const result = await pool.query(`
    WITH latest_capacity AS (
      SELECT DISTINCT ON (user_id) user_id, weekly_capacity_hours
      FROM member_capacity_profiles
      ORDER BY user_id, effective_from DESC
    ),
    availability_reduction AS (
      SELECT
        av.user_id,
        COALESCE(
          SUM(
            LEAST (av.ends_on, $3::text) :: date
            - GREATEST (av.starts_on, $2::text) :: date
            + 1
          ) * av.capacity_hours / 7.0,
          0.0
        ) AS unavailable_hours
      FROM member_availability av
      WHERE av.starts_on <= $3 AND av.ends_on >= $2
        AND av.availability_status IN ('unavailable', 'reduced_capacity')
      GROUP BY av.user_id, av.capacity_hours
    )
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email_display AS email,
      COALESCE(lc.weekly_capacity_hours, 40) AS capacity_hours,
      ROUND(
        COALESCE(SUM(pa.allocation_percent), 0.0) / 100.0
          * COALESCE(lc.weekly_capacity_hours, 40)
          * GREATEST(1.0, ((LEAST(pa.ends_on, $3) :: date - GREATEST(pa.starts_on, $2) :: date + 1) / 7.0) :: double precision)
          - COALESCE(ar.unavailable_hours, 0.0),
        1
      ) AS allocated_hours,
      1 AS allocated_projects
    FROM users u
    INNER JOIN project_memberships pm ON pm.user_id = u.id AND pm.project_id = $1
    LEFT JOIN latest_capacity lc ON lc.user_id = u.id
    LEFT JOIN project_member_allocations pa
      ON pa.user_id = u.id AND pa.project_id = $1 AND pa.starts_on <= $3 AND pa.ends_on >= $2
    LEFT JOIN availability_reduction ar ON ar.user_id = u.id
    WHERE u.status = 'active'
    GROUP BY u.id, u.name, u.email_display, lc.weekly_capacity_hours, ar.unavailable_hours
    ORDER BY u.name
  `, [projectId, startsOn, endsOn]);
  return result.rows as Array<Record<string, unknown>>;
}

export async function fetchProjectAllocations(projectId: string): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    `SELECT pa.*, pa.allocation_percent AS allocation_percentage, pa.allocation_percent AS percentage,
            u.name AS user_name, u.email_display AS user_email, p.name AS project_name
     FROM project_member_allocations pa
     LEFT JOIN users u ON u.id = pa.user_id
     LEFT JOIN projects p ON p.id = pa.project_id
     WHERE pa.project_id = $1
     ORDER BY pa.starts_on ASC, pa.id ASC`,
    [projectId],
  );
  return result.rows as Array<Record<string, unknown>>;
}

import { pool } from '../connection';
import type { AuthenticatedUser, OrganizationRole, UserStatus } from '../../types/auth';
import type { ProjectRole } from '../../types/auth';

type UserRow = AuthenticatedUser & { password_hash: string | null };

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const result = await pool.query(`
    SELECT id, name, email_display AS email, role, status, password_hash
    FROM users
    WHERE email_normalized = $1
  `, [email]);
  return result.rows[0] as UserRow | undefined;
}

export async function findActiveAdmin(): Promise<{ id: number } | undefined> {
  const result = await pool.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1");
  return result.rows[0] as { id: number } | undefined;
}

export async function createUser(input: {
  name: string;
  emailNormalized: string;
  emailDisplay: string;
  passwordHash: string | null;
  role: OrganizationRole;
  status: UserStatus;
}): Promise<number> {
  const result = await pool.query(`
    INSERT INTO users (name, email_normalized, email_display, password_hash, role, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [input.name, input.emailNormalized, input.emailDisplay, input.passwordHash, input.role, input.status]);
  return Number(result.rows[0].id);
}

export async function findUserById(userId: number): Promise<AuthenticatedUser | undefined> {
  const result = await pool.query(`
    SELECT id, name, email_display AS email, role, status
    FROM users
    WHERE id = $1
  `, [userId]);
  return result.rows[0] as AuthenticatedUser | undefined;
}

export async function activatePendingUser(userId: number, passwordHash: string): Promise<void> {
  await pool.query(`
    UPDATE users SET password_hash = $1, status = 'active', updated_at = NOW()
    WHERE id = $2 AND status = 'pending'
  `, [passwordHash, userId]);
}

export async function listUsers(): Promise<AuthenticatedUser[]> {
  const result = await pool.query(`
    SELECT id, name, email_display AS email, role, status
    FROM users
    ORDER BY name, id
  `);
  return result.rows as AuthenticatedUser[];
}

export async function updateUserAccount(userId: number, input: { name: string; role: OrganizationRole; status: UserStatus }): Promise<void> {
  await pool.query(`
    UPDATE users SET name = $1, role = $2, status = $3, updated_at = NOW()
    WHERE id = $4
  `, [input.name, input.role, input.status, userId]);
}

export async function updatePasswordHash(userId: number, passwordHash: string): Promise<void> {
  await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, userId]);
}

export interface MemberProjectSummary {
  project_id: number;
  project_name: string;
  status: string;
  priority: string;
  project_role: ProjectRole;
}

export interface MemberAssignmentsSummary {
  tasks: Array<{ id: number; title: string; status: string; priority: string; due_date: string | null; project_id: number; project_name: string }>;
  risks: Array<{ id: number; title: string; severity: string; status: string; due_date: string | null; project_id: number; project_name: string }>;
  issues: Array<{ id: number; title: string; priority: string; status: string; target_resolution_date: string | null; project_id: number; project_name: string }>;
  vault_entries: Array<{ id: number; title: string; entry_type: string; category: string | null; project_id: number | null; project_name: string | null }>;
  allocations: Array<{ project_id: number; project_name: string; starts_on: string; ends_on: string; allocation_percent: number }>;
}

export async function findMemberProjects(userId: number): Promise<MemberProjectSummary[]> {
  const result = await pool.query(`
    SELECT p.id AS project_id, p.name AS project_name, p.status, p.priority,
      project_memberships.project_role
    FROM project_memberships
    JOIN projects p ON p.id = project_memberships.project_id
    WHERE project_memberships.user_id = $1
    ORDER BY p.name
  `, [userId]);
  return result.rows as MemberProjectSummary[];
}

export async function findMemberAssignments(userId: number): Promise<MemberAssignmentsSummary> {
  const tasksResult = await pool.query(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id, p.name AS project_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_user_id = $1
    ORDER BY t.due_date ASC, t.id ASC
  `, [userId]);
  const risksResult = await pool.query(`
    SELECT r.id, r.title, r.severity, r.status, r.due_date, r.project_id, p.name AS project_name
    FROM risks r
    JOIN projects p ON p.id = r.project_id
    WHERE r.owner_user_id = $1
    ORDER BY r.due_date ASC, r.id ASC
  `, [userId]);
  const issuesResult = await pool.query(`
    SELECT i.id, i.title, i.priority, i.status, i.target_resolution_date, i.project_id, p.name AS project_name
    FROM issues i
    JOIN projects p ON p.id = i.project_id
    WHERE i.owner_user_id = $1
    ORDER BY i.target_resolution_date ASC, i.id ASC
  `, [userId]);
  const vaultResult = await pool.query(`
    SELECT v.id, v.title, v.entry_type, v.category, v.project_id, p.name AS project_name
    FROM vault_entries v
    LEFT JOIN projects p ON p.id = v.project_id
    WHERE v.owner_user_id = $1
    ORDER BY v.updated_at DESC, v.id DESC
  `, [userId]);
  const allocationsResult = await pool.query(`
    SELECT a.project_id, p.name AS project_name, a.starts_on, a.ends_on, a.allocation_percent
    FROM project_member_allocations a
    JOIN projects p ON p.id = a.project_id
    WHERE a.user_id = $1
    ORDER BY a.starts_on ASC
  `, [userId]);
  return {
    tasks: tasksResult.rows,
    risks: risksResult.rows,
    issues: issuesResult.rows,
    vault_entries: vaultResult.rows,
    allocations: allocationsResult.rows,
  } as MemberAssignmentsSummary;
}

export async function countActiveAdmins(): Promise<number> {
  const result = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'");
  return Number(result.rows[0].count);
}

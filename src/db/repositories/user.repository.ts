import { pool } from '../connection';
import type { AuthenticatedUser, OrganizationRole, UserStatus } from '../../types/auth';

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

export async function countActiveAdmins(): Promise<number> {
  const result = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'");
  return Number(result.rows[0].count);
}

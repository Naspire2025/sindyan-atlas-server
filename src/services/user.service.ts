import { countActiveAdmins, findMemberAssignments, findMemberProjects, findUserById, listUsers, updateUserAccount } from '../db/repositories/user.repository';
import { revokeActiveSessionsForUser } from '../db/repositories/session.repository';
import { pool } from '../db/connection';
import type { AuthenticatedUser, OrganizationRole, UserStatus } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { requireAdmin } from './project-access.service';

function parseName(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, 'name must not be empty.');
  return value.trim();
}

function parseRole(value: unknown, fallback: OrganizationRole): OrganizationRole {
  if (value === undefined) return fallback;
  if (value === 'admin' || value === 'team_member') return value;
  throw new AppError(400, 'role must be admin or team_member.');
}

function parseStatus(value: unknown, fallback: UserStatus): UserStatus {
  if (value === undefined) return fallback;
  if (value === 'active' || value === 'suspended') return value;
  throw new AppError(400, 'status must be active or suspended.');
}

export async function listOrganizationUsers(actor: AuthenticatedUser): Promise<AuthenticatedUser[]> {
  requireAdmin(actor);
  return listUsers();
}

export async function getOrganizationUser(actor: AuthenticatedUser, userId: string): Promise<AuthenticatedUser> {
  requireAdmin(actor);
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, 'User unavailable.');
  return user;
}

async function canViewMember(actor: AuthenticatedUser, userId: string): Promise<void> {
  if (actor.role === 'admin' || actor.id === userId) return;
  const sharedResult = await pool.query(`
    SELECT 1
    FROM project_memberships actor
    JOIN project_memberships target ON target.project_id = actor.project_id
    WHERE actor.user_id = $1 AND target.user_id = $2
    LIMIT 1
  `, [actor.id, userId]);
  if (!sharedResult.rows[0]) throw new AppError(404, 'Member unavailable.');
}

export async function getMemberSummary(actor: AuthenticatedUser, userId: string) {
  await canViewMember(actor, userId);
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, 'User unavailable.');
  const [projects, assignments] = await Promise.all([findMemberProjects(userId), findMemberAssignments(userId)]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    projects,
    assignments,
  };
}

export async function updateOrganizationUser(actor: AuthenticatedUser, userId: string, body: unknown): Promise<AuthenticatedUser> {
  requireAdmin(actor);
  const existing = await findUserById(userId);
  if (!existing) throw new AppError(404, 'User unavailable.');
  const input = body as { name?: unknown; role?: unknown; status?: unknown };
  const next = { name: parseName(input.name, existing.name), role: parseRole(input.role, existing.role), status: parseStatus(input.status, existing.status) };
  const removesActiveAdmin = existing.role === 'admin' && existing.status === 'active' && (next.role !== 'admin' || next.status !== 'active');
  if (removesActiveAdmin && (await countActiveAdmins()) <= 1) throw new AppError(409, 'Atlas must retain one active administrator.');
  await updateUserAccount(userId, next);
  if (next.status === 'suspended' || removesActiveAdmin) await revokeActiveSessionsForUser(userId);
  return getOrganizationUser(actor, userId);
}

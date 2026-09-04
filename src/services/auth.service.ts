import { pool } from '../db/connection';
import { createSession, revokeActiveSessionsForUser } from '../db/repositories/session.repository';
import { createUser, findActiveAdmin, findUserByEmail, activatePendingUser, updatePasswordHash } from '../db/repositories/user.repository';
import { acceptInvitation, createInvitation, findInvitationById, findPendingInvitation, listInvitationAssignments, revokeInvitation, listInvitations } from '../db/repositories/invitation.repository';
import type { AuthenticatedUser, OrganizationRole, ProjectRole } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isUuid } from '../utils/request.util';
import { hashPassword, verifyPassword } from '../utils/password.util';
import { createOpaqueToken, hashToken } from '../utils/token.util';
import { env } from '../config/env';
import { deliverInvitation } from './invitation-delivery.service';

export type NewSession = {
  token: string;
  expiresAt: Date;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

async function createSessionForUser(userId: string): Promise<NewSession> {
  const now = new Date();
  const absoluteExpiresAt = addDays(now, env.sessionAbsoluteDays);
  const expiresAt = addHours(now, env.sessionIdleHours);
  const token = createOpaqueToken();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await revokeActiveSessionsForUser(userId);
    await createSession({
      userId,
      tokenHash: hashToken(token),
      expiresAt: expiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { token, expiresAt };
}

type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

function invitationStatus(row: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): InvitationStatus {
  if (row.revoked_at) return 'revoked';
  if (row.accepted_at) return 'accepted';
  if (Date.parse(row.expires_at) <= Date.now()) return 'expired';
  return 'pending';
}

export async function listInvitationSummaries(): Promise<
  Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: InvitationStatus;
    created_at: string;
  }>
> {
  const rows = await listInvitations();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email_normalized,
    role: row.role,
    status: invitationStatus(row),
    created_at: row.created_at,
  }));
}

export async function bootstrapAdmin(): Promise<void> {
  if (await findActiveAdmin()) return;
  const { bootstrapAdminEmail, bootstrapAdminName, bootstrapAdminPassword } = env;
  if (!bootstrapAdminEmail || !bootstrapAdminName || !bootstrapAdminPassword) return;

  const emailNormalized = normalizeEmail(bootstrapAdminEmail);
  const existingUser = await findUserByEmail(emailNormalized);
  if (existingUser) return;

  const passwordHash = await hashPassword(bootstrapAdminPassword);
  await createUser({
    name: bootstrapAdminName,
    emailNormalized,
    emailDisplay: bootstrapAdminEmail,
    passwordHash,
    role: 'admin',
    status: 'active',
  });
}

export async function login(input: { email: string; password: string }): Promise<{ user: AuthenticatedUser; session: NewSession }> {
  const user = await findUserByEmail(normalizeEmail(input.email));
  if (!user?.password_hash || user.status !== 'active') {
    throw new AppError(401, 'Invalid email or password.');
  }

  const isPasswordValid = await verifyPassword(user.password_hash, input.password);
  if (!isPasswordValid) throw new AppError(401, 'Invalid email or password.');

  const { password_hash: _passwordHash, ...authenticatedUser } = user;
  return { user: authenticatedUser, session: await createSessionForUser(user.id) };
}

export async function createSessionForAuthenticatedUser(userId: string): Promise<NewSession> {
  return createSessionForUser(userId);
}

export async function changePassword(user: AuthenticatedUser, currentPassword: unknown, newPassword: unknown): Promise<NewSession> {
  if (typeof currentPassword !== 'string' || !currentPassword) throw new AppError(400, 'current_password is required.');
  const account = await findUserByEmail(normalizeEmail(user.email));
  if (!account?.password_hash || !(await verifyPassword(account.password_hash, currentPassword))) {
    throw new AppError(401, 'Current password is incorrect.');
  }
  const passwordHash = await hashPassword(validatePassword(newPassword));
  await updatePasswordHash(user.id, passwordHash);
  return createSessionForUser(user.id);
}

export function validateRole(role: string): OrganizationRole {
  if (role === 'admin' || role === 'team_member') return role;
  throw new AppError(400, 'role must be admin or team_member.');
}

function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 12) {
    throw new AppError(400, 'Password must be at least 12 characters.');
  }
  return password;
}

function validateProjectAssignments(value: unknown): Array<{ projectId: string; projectRole: ProjectRole }> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AppError(400, 'project_assignments must be an array.');
  return value.map((assignment) => {
    const input = assignment as { project_id?: unknown; project_role?: unknown };
    if (!isUuid(input.project_id)) throw new AppError(400, 'Each project assignment requires a valid project_id.');
    if (input.project_role !== undefined && input.project_role !== 'member' && input.project_role !== 'project_lead') {
      throw new AppError(400, 'Invalid project role.');
    }
    return { projectId: input.project_id, projectRole: input.project_role ?? 'member' };
  });
}

export async function inviteUser(creator: AuthenticatedUser, body: unknown): Promise<void> {
  if (creator.role !== 'admin') throw new AppError(403, 'Administrator access is required.');
  const input = body as { email?: unknown; name?: unknown; role?: unknown; project_assignments?: unknown };
  if (typeof input.email !== 'string' || !input.email.trim() || typeof input.name !== 'string' || !input.name.trim()) {
    throw new AppError(400, 'name and email are required.');
  }
  const email = input.email.trim();
  const name = input.name.trim();
  const emailNormalized = normalizeEmail(email);
  const existingUser = await findUserByEmail(emailNormalized);
  if (existingUser?.status === 'active') throw new AppError(409, 'An active user already uses this email.');

  const token = createOpaqueToken();

  const client = await pool.connect();
  let invitationId: string;
  try {
    await client.query('BEGIN');
    invitationId = await createInvitation({
      emailNormalized,
      name,
      role: validateRole(typeof input.role === 'string' ? input.role : 'team_member'),
      tokenHash: hashToken(token),
      expiresAt: addDays(new Date(), 7).toISOString(),
      createdByUserId: creator.id,
      projectAssignments: validateProjectAssignments(input.project_assignments),
    });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  try {
    await deliverInvitation({ email, name, token });
  } catch (error) {
    await revokeInvitation(invitationId);
    throw error;
  }
}

export async function resendInvitation(creator: AuthenticatedUser, invitationId: string): Promise<void> {
  if (creator.role !== 'admin') throw new AppError(403, 'Administrator access is required.');
  const invitation = await findInvitationById(invitationId);
  if (!invitation) throw new AppError(404, 'Invitation unavailable.');
  const token = createOpaqueToken();
  const assignments = await listInvitationAssignments(invitation.id);

  const client = await pool.connect();
  let replacementId: string;
  try {
    await client.query('BEGIN');
    replacementId = await createInvitation({
      emailNormalized: invitation.email_normalized,
      name: invitation.name,
      role: invitation.role,
      tokenHash: hashToken(token),
      expiresAt: addDays(new Date(), 7).toISOString(),
      createdByUserId: creator.id,
      projectAssignments: assignments.map((assignment) => ({ projectId: assignment.project_id, projectRole: assignment.project_role })),
    });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  try {
    await deliverInvitation({ email: invitation.email_normalized, name: invitation.name, token });
    await revokeInvitation(invitationId);
  } catch (error) {
    await revokeInvitation(replacementId);
    throw error;
  }
}

export async function revokePendingInvitation(creator: AuthenticatedUser, invitationId: string): Promise<void> {
  if (creator.role !== 'admin') throw new AppError(403, 'Administrator access is required.');
  if (!(await findInvitationById(invitationId))) throw new AppError(404, 'Invitation unavailable.');
  await revokeInvitation(invitationId);
}

export async function acceptInvitationToken(token: string, password: unknown): Promise<{ user: AuthenticatedUser; session: NewSession }> {
  const invitation = await findPendingInvitation(hashToken(token));
  if (!invitation) throw new AppError(401, 'Invitation is invalid or expired.');
  const passwordHash = await hashPassword(validatePassword(password));
  const existingUser = await findUserByEmail(invitation.email_normalized);

  const client = await pool.connect();
  let userId: string;
  try {
    await client.query('BEGIN');
    const resolvedUserId = existingUser
      ? existingUser.id
      : await createUser({
        name: invitation.name,
        emailNormalized: invitation.email_normalized,
        emailDisplay: invitation.email_normalized,
        passwordHash: null,
        role: invitation.role,
        status: 'pending',
      });
    if (existingUser?.status === 'active') throw new AppError(409, 'This invitation has already been accepted.');
    await activatePendingUser(resolvedUserId, passwordHash);
    const assignments = await listInvitationAssignments(invitation.id);
    for (const assignment of assignments) {
      await client.query(`
        INSERT INTO project_memberships (project_id, user_id, project_role)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [assignment.project_id, resolvedUserId, assignment.project_role]);
    }
    await acceptInvitation(invitation.id);
    await client.query('COMMIT');
    userId = resolvedUserId;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const user = await findUserByEmail(invitation.email_normalized);
  if (!user) throw new AppError(500, 'Invitation acceptance failed.');
  const { password_hash: _passwordHash, ...authenticatedUser } = user;
  return { user: authenticatedUser, session: await createSessionForUser(userId) };
}

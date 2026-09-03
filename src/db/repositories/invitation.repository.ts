import { pool } from '../connection';
import type { OrganizationRole, ProjectRole } from '../../types/auth';

export type InvitationRow = {
  id: string;
  email_normalized: string;
  name: string;
  role: OrganizationRole;
  expires_at: string;
};

export type InvitationSummary = InvitationRow & { accepted_at: string | null; revoked_at: string | null; created_at: string };

export async function createInvitation(input: {
  emailNormalized: string;
  name: string;
  role: OrganizationRole;
  tokenHash: string;
  expiresAt: string;
  createdByUserId: string;
  projectAssignments: Array<{ projectId: string; projectRole: ProjectRole }>;
}): Promise<string> {
  const result = await pool.query(`
    INSERT INTO invitations (email_normalized, name, role, token_hash, expires_at, created_by_user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [input.emailNormalized, input.name, input.role, input.tokenHash, input.expiresAt, input.createdByUserId]);
  const invitationId = result.rows[0].id as string;
  for (const assignment of input.projectAssignments) {
    await pool.query(`
      INSERT INTO invitation_project_memberships (invitation_id, project_id, project_role)
      VALUES ($1, $2, $3)
    `, [invitationId, assignment.projectId, assignment.projectRole]);
  }
  return invitationId;
}

export async function findPendingInvitation(tokenHash: string): Promise<InvitationRow | undefined> {
  const result = await pool.query(`
    SELECT id, email_normalized, name, role, expires_at
    FROM invitations
    WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL
      AND datetime(expires_at) > NOW()
  `, [tokenHash]);
  return result.rows[0] as InvitationRow | undefined;
}

export async function listInvitationAssignments(invitationId: string): Promise<Array<{ project_id: string; project_role: ProjectRole }>> {
  const result = await pool.query(`
    SELECT project_id, project_role
    FROM invitation_project_memberships
    WHERE invitation_id = $1
  `, [invitationId]);
  return result.rows as Array<{ project_id: string; project_role: ProjectRole }>;
}

export async function acceptInvitation(invitationId: string): Promise<void> {
  await pool.query("UPDATE invitations SET accepted_at = NOW() WHERE id = $1", [invitationId]);
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await pool.query("UPDATE invitations SET revoked_at = NOW() WHERE id = $1", [invitationId]);
}

export async function findInvitationById(invitationId: string): Promise<InvitationRow | undefined> {
  const result = await pool.query(`
    SELECT id, email_normalized, name, role, expires_at
    FROM invitations WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
  `, [invitationId]);
  return result.rows[0] as InvitationRow | undefined;
}

export async function listInvitations(): Promise<InvitationSummary[]> {
  const result = await pool.query(`
    SELECT id, email_normalized, name, role, expires_at, accepted_at, revoked_at, created_at
    FROM invitations ORDER BY created_at DESC, id DESC
  `);
  return result.rows as InvitationSummary[];
}

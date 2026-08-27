import { pool } from '../db/connection';
import { deleteInactiveSessions } from '../db/repositories/session.repository';

export async function cleanExpiredSecurityRecords(): Promise<{ sessions: number; invitations: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sessions = await deleteInactiveSessions();
    const invitationsResult = await client.query(`
      DELETE FROM invitations
      WHERE NOW() >= (COALESCE(revoked_at, accepted_at, expires_at) + INTERVAL '30 days')
    `);
    const invitations = invitationsResult.rowCount ?? 0;
    await client.query('COMMIT');
    return { sessions, invitations };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

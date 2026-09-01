import { pool } from '../connection';
import type { SessionIdentity } from '../../types/auth';

type SessionRow = SessionIdentity;

export async function revokeActiveSessionsForUser(userId: number): Promise<void> {
  await pool.query(`
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE user_id = $1 AND revoked_at IS NULL
  `, [userId]);
}

export async function createSession(input: {
  userId: number;
  tokenHash: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}): Promise<number> {
  const result = await pool.query(`
    INSERT INTO sessions (user_id, token_hash, expires_at, absolute_expires_at)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [input.userId, input.tokenHash, input.expiresAt, input.absoluteExpiresAt]);
  return Number(result.rows[0].id);
}

export async function findSessionIdentity(tokenHash: string): Promise<SessionRow | undefined> {
  const result = await pool.query(`
    SELECT
      sessions.id AS "sessionId",
      sessions.expires_at AS "expiresAt",
      sessions.absolute_expires_at AS "absoluteExpiresAt",
      users.id, users.name, users.email_display AS email, users.role, users.status
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > NOW()
      AND sessions.absolute_expires_at > NOW()
  `, [tokenHash]);
  return result.rows[0] as SessionRow | undefined;
}

export async function touchSession(sessionId: number, expiresAt: string): Promise<void> {
  await pool.query(`
    UPDATE sessions
    SET last_seen_at = NOW(), expires_at = $1
    WHERE id = $2 AND revoked_at IS NULL
  `, [expiresAt, sessionId]);
}

export async function revokeSession(sessionId: number): Promise<void> {
  await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE id = $1", [sessionId]);
}

export async function deleteInactiveSessions(): Promise<number> {
  const result = await pool.query(`
    DELETE FROM sessions
    WHERE revoked_at IS NOT NULL OR expires_at <= NOW()
  `);
  return result.rowCount ?? 0;
}

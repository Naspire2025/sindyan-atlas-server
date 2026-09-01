import { pool } from '../db/connection';
import { deleteInactiveSessions } from '../db/repositories/session.repository';
import { listStalePendingVaultFiles, updateVaultFileStatus, writeVaultAuditLog } from '../db/repositories/vault.repository';
import { deleteObject, isR2Configured } from './r2.service';

const STALE_UPLOAD_HOURS = 24;

async function cleanStaleVaultFiles(): Promise<number> {
  if (!isR2Configured()) return 0;
  const files = await listStalePendingVaultFiles(STALE_UPLOAD_HOURS);
  let cleaned = 0;

  for (const file of files) {
    try {
      await deleteObject(String(file.storage_key));
      await updateVaultFileStatus(file.id, { storageStatus: 'deleted' });
      await writeVaultAuditLog({
        vaultEntryId: file.vault_entry_id,
        vaultFileId: file.id,
        actorUserId: null,
        action: file.storage_status === 'deletion_pending' ? 'file_deletion_retry_succeeded' : 'abandoned_upload_deleted',
        requestId: null,
        metadataJson: null,
      });
      cleaned += 1;
    } catch (error) {
      await updateVaultFileStatus(file.id, { storageStatus: 'deletion_pending' });
      console.error('Vault file cleanup could not confirm object deletion:', { fileId: file.id, status: file.storage_status });
    }
  }

  return cleaned;
}

export async function cleanExpiredSecurityRecords(): Promise<{ sessions: number; invitations: number; vaultFiles: number }> {
  const client = await pool.connect();
  let sessions = 0;
  let invitations = 0;
  try {
    await client.query('BEGIN');
    sessions = await deleteInactiveSessions();
    const invitationsResult = await client.query(`
      DELETE FROM invitations
      WHERE NOW() >= (COALESCE(revoked_at, accepted_at, expires_at) + INTERVAL '30 days')
    `);
    invitations = invitationsResult.rowCount ?? 0;
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const vaultFiles = await cleanStaleVaultFiles();
  return { sessions, invitations, vaultFiles };
}

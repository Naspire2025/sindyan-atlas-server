import { pool } from '../connection';

export type VaultEntryRow = Record<string, unknown> & { id: string; owner_user_id: string };
export type VaultSecretRow = Record<string, unknown> & { vault_entry_id: string };
export type VaultTagRow = Record<string, unknown> & { id: string };
export type VaultFileRow = Record<string, unknown> & { id: string; vault_entry_id: string };

export async function findVaultEntry(entryId: string): Promise<VaultEntryRow | undefined> {
  const result = await pool.query('SELECT * FROM vault_entries WHERE id = $1', [entryId]);
  return result.rows[0] as VaultEntryRow | undefined;
}

export async function listVaultEntries(filters: { projectId?: string; ownerUserId?: string; includeArchived?: boolean }): Promise<VaultEntryRow[]> {
  const conditions: string[] = [];
  const parameters: unknown[] = [];
  let paramIndex = 1;
  if (filters.projectId !== undefined) {
    conditions.push(`project_id = $${paramIndex++}`);
    parameters.push(filters.projectId);
  }
  if (filters.ownerUserId !== undefined) {
    conditions.push(`owner_user_id = $${paramIndex++}`);
    parameters.push(filters.ownerUserId);
  }
  if (!filters.includeArchived) {
    conditions.push('archived_at IS NULL');
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(`SELECT * FROM vault_entries ${where} ORDER BY created_at DESC`, parameters);
  return result.rows as VaultEntryRow[];
}

export async function createVaultEntry(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(
    `INSERT INTO vault_entries (project_id, owner_user_id, entry_type, title, category, markdown_content, external_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.projectId, input.ownerUserId, input.entryType, input.title, input.category, input.markdownContent, input.externalUrl],
  );
  return result.rows[0].id as string;
}

export async function updateVaultEntry(entryId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE vault_entries
     SET title = $1, category = $2, markdown_content = $3,
         external_url = $4, project_id = $5, updated_at = NOW()
     WHERE id = $6`,
    [input.title, input.category, input.markdownContent, input.externalUrl, input.projectId, entryId],
  );
}

export async function archiveVaultEntry(entryId: string): Promise<void> {
  await pool.query(
    "UPDATE vault_entries SET archived_at = NOW(), updated_at = NOW() WHERE id = $1",
    [entryId],
  );
}

export async function deleteVaultEntry(entryId: string): Promise<void> {
  await pool.query('DELETE FROM vault_entries WHERE id = $1', [entryId]);
}

export async function findVaultSecret(entryId: string): Promise<VaultSecretRow | undefined> {
  const result = await pool.query('SELECT * FROM vault_secrets WHERE vault_entry_id = $1', [entryId]);
  return result.rows[0] as VaultSecretRow | undefined;
}

export async function upsertVaultSecret(entryId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO vault_secrets (vault_entry_id, encrypted_value, key_version, nonce, auth_tag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(vault_entry_id) DO UPDATE SET
       encrypted_value = $2, key_version = $3,
       nonce = $4, auth_tag = $5, updated_at = NOW()`,
    [entryId, input.encryptedValue, input.keyVersion, input.nonce, input.authTag],
  );
}

export async function deleteVaultSecret(entryId: string): Promise<void> {
  await pool.query('DELETE FROM vault_secrets WHERE vault_entry_id = $1', [entryId]);
}

export async function findVaultTagByName(normalizedName: string): Promise<VaultTagRow | undefined> {
  const result = await pool.query('SELECT * FROM vault_tags WHERE name_normalized = $1', [normalizedName]);
  return result.rows[0] as VaultTagRow | undefined;
}

export async function createVaultTag(displayName: string, normalizedName: string): Promise<string> {
  const result = await pool.query(
    'INSERT INTO vault_tags (display_name, name_normalized) VALUES ($1, $2) RETURNING id',
    [displayName, normalizedName],
  );
  return result.rows[0].id as string;
}

export async function listVaultEntryTags(entryId: string): Promise<VaultTagRow[]> {
  const result = await pool.query(
    `SELECT vt.id, vt.name_normalized, vt.display_name
     FROM vault_entry_tags vet
     JOIN vault_tags vt ON vt.id = vet.vault_tag_id
     WHERE vet.vault_entry_id = $1
     ORDER BY vt.display_name`,
    [entryId],
  );
  return result.rows as VaultTagRow[];
}

export async function setVaultEntryTags(entryId: string, tagIds: string[]): Promise<void> {
  await pool.query('DELETE FROM vault_entry_tags WHERE vault_entry_id = $1', [entryId]);
  for (const tagId of tagIds) {
    await pool.query(
      'INSERT INTO vault_entry_tags (vault_entry_id, vault_tag_id) VALUES ($1, $2)',
      [entryId, tagId],
    );
  }
}

export async function listVaultFiles(entryId: string): Promise<VaultFileRow[]> {
  const result = await pool.query(
    `SELECT id, vault_entry_id, original_filename, content_type, size_bytes, storage_status, uploaded_by_user_id, uploaded_at, available_at
     FROM vault_files WHERE vault_entry_id = $1 ORDER BY uploaded_at ASC`,
    [entryId],
  );
  return result.rows as VaultFileRow[];
}

export async function writeVaultAuditLog(input: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO vault_audit_log (vault_entry_id, vault_file_id, actor_user_id, action, request_id, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.vaultEntryId, input.vaultFileId, input.actorUserId, input.action, input.requestId, input.metadataJson],
  );
}

export async function findVaultFile(fileId: string): Promise<VaultFileRow | undefined> {
  const result = await pool.query('SELECT * FROM vault_files WHERE id = $1', [fileId]);
  return result.rows[0] as VaultFileRow | undefined;
}

export async function createVaultFile(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(
    `INSERT INTO vault_files (vault_entry_id, storage_key, original_filename, content_type, size_bytes, storage_status, uploaded_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.vaultEntryId, input.storageKey, input.originalFilename, input.contentType, input.sizeBytes, input.storageStatus, input.uploadedByUserId],
  );
  return result.rows[0].id as string;
}

export async function updateVaultFileStatus(fileId: string, input: { storageStatus: string; checksum?: string | null }): Promise<void> {
  const shouldUpdateChecksum = Object.prototype.hasOwnProperty.call(input, 'checksum');
  const parameters = [input.storageStatus, shouldUpdateChecksum, input.checksum ?? null, fileId];
  if (input.storageStatus === 'available') {
    await pool.query(
      'UPDATE vault_files SET storage_status = $1, checksum_sha256 = CASE WHEN $2 THEN $3 ELSE checksum_sha256 END, available_at = NOW() WHERE id = $4',
      parameters,
    );
  } else if (input.storageStatus === 'deleted') {
    await pool.query(
      'UPDATE vault_files SET storage_status = $1, checksum_sha256 = CASE WHEN $2 THEN $3 ELSE checksum_sha256 END, deleted_at = NOW() WHERE id = $4',
      parameters,
    );
  } else {
    await pool.query(
      'UPDATE vault_files SET storage_status = $1, checksum_sha256 = CASE WHEN $2 THEN $3 ELSE checksum_sha256 END WHERE id = $4',
      parameters,
    );
  }
}

export async function listStalePendingVaultFiles(olderThanHours: number): Promise<VaultFileRow[]> {
  const result = await pool.query(
    `SELECT * FROM vault_files
     WHERE storage_status IN ('pending', 'deletion_pending')
       AND uploaded_at < NOW() - ($1::text || ' hours')::interval
     ORDER BY uploaded_at ASC
     LIMIT 100`,
    [olderThanHours],
  );
  return result.rows as VaultFileRow[];
}

export async function deleteVaultFile(fileId: string): Promise<void> {
  await pool.query(
    "UPDATE vault_files SET storage_status = 'deleted', deleted_at = NOW() WHERE id = $1",
    [fileId],
  );
}

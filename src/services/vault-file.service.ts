import { pool } from '../db/connection';
import {
  findVaultEntry,
  findVaultFile,
  listVaultFiles,
  createVaultFile,
  updateVaultFileStatus,
  deleteVaultFile,
  writeVaultAuditLog,
} from '../db/repositories/vault.repository';
import { generateStorageKey, isAllowedMimeType, isWithinSizeLimit, createSignedUploadUrl, verifyObjectExists, createSignedDownloadUrl, deleteObject, isR2Configured } from './r2.service';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { requireAdmin, requireProjectAccess } from './project-access.service';

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${field} is required.`);
  return value.trim();
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new AppError(400, `${field} must be a positive integer.`);
  return value;
}

async function requireFileEntryAccess(user: AuthenticatedUser, entryId: number) {
  const entry = await findVaultEntry(entryId);
  if (!entry || entry.archived_at) throw new AppError(404, 'Vault entry unavailable.');
  if (entry.project_id) {
    await requireProjectAccess(user, Number(entry.project_id));
  }
  return entry;
}

async function requireVaultFile(fileId: number) {
  const file = await findVaultFile(fileId);
  if (!file || file.storage_status === 'deleted') throw new AppError(404, 'Vault file unavailable.');
  return file;
}

async function recordAudit(entryId: number, fileId: number | null, userId: number, action: string): Promise<void> {
  await writeVaultAuditLog({
    vaultEntryId: entryId,
    vaultFileId: fileId,
    actorUserId: userId,
    action,
    requestId: null,
    metadataJson: null,
  });
}

export async function listEntryFiles(user: AuthenticatedUser, entryId: number) {
  await requireFileEntryAccess(user, entryId);
  return listVaultFiles(entryId);
}

export async function createUploadIntent(user: AuthenticatedUser, entryId: number, body: unknown) {
  if (!isR2Configured()) throw new AppError(503, 'File storage is not configured.');
  const entry = await requireFileEntryAccess(user, entryId);
  if (entry.entry_type !== 'file') throw new AppError(400, 'Only file entries can have uploads.');

  const input = body as Record<string, unknown>;
  const filename = requiredText(input.filename, 'filename');
  const contentType = requiredText(input.content_type, 'content_type');
  const sizeBytes = requiredNumber(input.size_bytes, 'size_bytes');

  if (!isAllowedMimeType(contentType)) throw new AppError(400, 'File type is not allowed.');
  if (!isWithinSizeLimit(sizeBytes)) throw new AppError(400, 'File size exceeds the maximum allowed.');

  const storageKey = generateStorageKey(entryId);
  const signedUploadUrl = await createSignedUploadUrl(storageKey, contentType, sizeBytes);

  const fileId = await createVaultFile({
    vaultEntryId: entryId,
    storageKey,
    originalFilename: filename,
    contentType,
    sizeBytes,
    storageStatus: 'pending',
    uploadedByUserId: user.id,
  });

  await recordAudit(entryId, fileId, user.id, 'upload_intent');
  return { file_id: fileId, upload_url: signedUploadUrl, storage_key: storageKey };
}

export async function finalizeUpload(user: AuthenticatedUser, fileId: number, body: unknown) {
  if (!isR2Configured()) throw new AppError(503, 'File storage is not configured.');
  const file = await requireVaultFile(fileId);
  if (file.storage_status !== 'pending') throw new AppError(409, 'File is not in a pending state.');
  await requireFileEntryAccess(user, Number(file.vault_entry_id));

  const input = body as Record<string, unknown>;
  const checksum = input.checksum_sha256 as string | undefined;

  const exists = await verifyObjectExists(String(file.storage_key), Number(file.size_bytes));
  if (!exists) throw new AppError(400, 'Uploaded file not found or size mismatch.');

  await updateVaultFileStatus(fileId, { storageStatus: 'quarantined', checksum: checksum ?? null });
  await recordAudit(Number(file.vault_entry_id), fileId, user.id, 'upload_finalized');
  return { file_id: fileId, storage_status: 'quarantined' };
}

export async function downloadFile(user: AuthenticatedUser, fileId: number) {
  if (!isR2Configured()) throw new AppError(503, 'File storage is not configured.');
  const file = await requireVaultFile(fileId);
  if (file.storage_status !== 'available') throw new AppError(400, 'File is not available for download.');
  await requireFileEntryAccess(user, Number(file.vault_entry_id));

  const downloadUrl = await createSignedDownloadUrl(String(file.storage_key), String(file.original_filename));
  await recordAudit(Number(file.vault_entry_id), fileId, user.id, 'download');
  return { download_url: downloadUrl, filename: file.original_filename, content_type: file.content_type, size_bytes: file.size_bytes };
}

export async function deleteFile(user: AuthenticatedUser, fileId: number): Promise<void> {
  requireAdmin(user);
  const file = await requireVaultFile(fileId);

  try {
    await deleteObject(String(file.storage_key));
  } catch {
    // Best-effort R2 deletion; mark deleted regardless
  }

  await updateVaultFileStatus(fileId, { storageStatus: 'deleted' });
  await recordAudit(Number(file.vault_entry_id), fileId, user.id, 'file_deleted');
}

export async function approveScanResult(fileId: number, status: 'available' | 'rejected'): Promise<void> {
  const file = await requireVaultFile(fileId);
  if (file.storage_status !== 'quarantined') return;
  if (status === 'available') {
    await updateVaultFileStatus(fileId, { storageStatus: 'available' });
  } else {
    await updateVaultFileStatus(fileId, { storageStatus: 'rejected' });
    deleteObject(String(file.storage_key)).catch(() => {});
  }
}

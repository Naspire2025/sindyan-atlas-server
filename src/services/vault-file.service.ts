import { pool } from '../db/connection';
import {
  findVaultEntry,
  findVaultFile,
  listVaultFiles,
  createVaultFile,
  updateVaultFileStatus,
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

function normalizeFilename(value: unknown): string {
  const filename = requiredText(value, 'filename').replace(/[\\/]+/g, '-').replace(/\s+/g, ' ');
  if (filename.length > 255) throw new AppError(400, 'filename must be 255 characters or fewer.');
  if (/[\u0000-\u001F\u007F]/u.test(filename)) throw new AppError(400, 'filename contains unsupported characters.');
  if (filename === '.' || filename === '..') throw new AppError(400, 'filename is invalid.');
  return filename;
}

function optionalChecksum(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new AppError(400, 'checksum_sha256 must be a valid SHA-256 hex digest.');
  }
  return value.toLowerCase();
}

function canDeleteFile(user: AuthenticatedUser, file: Record<string, unknown>): boolean {
  return user.role === 'admin' || (file.storage_status === 'pending' && file.uploaded_by_user_id === user.id);
}

async function requireFileEntryAccess(user: AuthenticatedUser, entryId: string) {
  const entry = await findVaultEntry(entryId);
  if (!entry || entry.archived_at) throw new AppError(404, 'Vault entry unavailable.');
  if (entry.project_id) {
    await requireProjectAccess(user, String(entry.project_id));
  }
  return entry;
}

async function requireVaultFile(fileId: string) {
  const file = await findVaultFile(fileId);
  if (!file || file.storage_status === 'deleted') throw new AppError(404, 'Vault file unavailable.');
  return file;
}

async function recordAudit(entryId: string, fileId: string | null, userId: string, action: string): Promise<void> {
  await writeVaultAuditLog({
    vaultEntryId: entryId,
    vaultFileId: fileId,
    actorUserId: userId,
    action,
    requestId: null,
    metadataJson: null,
  });
}

export async function listEntryFiles(user: AuthenticatedUser, entryId: string) {
  await requireFileEntryAccess(user, entryId);
  return listVaultFiles(entryId);
}

export async function createUploadIntent(user: AuthenticatedUser, entryId: string, body: unknown) {
  if (!isR2Configured()) throw new AppError(503, 'File storage is not configured.');
  const entry = await requireFileEntryAccess(user, entryId);
  if (entry.entry_type !== 'file') throw new AppError(400, 'Only file entries can have uploads.');

  const input = body as Record<string, unknown>;
  const filename = normalizeFilename(input.filename);
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
  return { file_id: fileId, upload_url: signedUploadUrl, storage_status: 'pending' };
}

export async function finalizeUpload(user: AuthenticatedUser, fileId: string, body: unknown) {
  if (!isR2Configured()) throw new AppError(503, 'File storage is not configured.');
  const file = await requireVaultFile(fileId);
  if (file.storage_status !== 'pending') throw new AppError(409, 'File is not in a pending state.');
  await requireFileEntryAccess(user, String(file.vault_entry_id));

  const input = body as Record<string, unknown>;
  const checksum = optionalChecksum(input.checksum_sha256);

  const exists = await verifyObjectExists(String(file.storage_key), Number(file.size_bytes));
  if (!exists) throw new AppError(400, 'Uploaded file not found or size mismatch.');

  await updateVaultFileStatus(fileId, { storageStatus: 'quarantined', checksum: checksum ?? null });
  await recordAudit(String(file.vault_entry_id), fileId, user.id, 'upload_finalized');
  return { file_id: fileId, storage_status: 'quarantined' };
}

export async function downloadFile(user: AuthenticatedUser, fileId: string) {
  if (!isR2Configured()) throw new AppError(503, 'File storage is not configured.');
  const file = await requireVaultFile(fileId);
  if (file.storage_status !== 'available') throw new AppError(400, 'File is not available for download.');
  await requireFileEntryAccess(user, String(file.vault_entry_id));

  const downloadUrl = await createSignedDownloadUrl(String(file.storage_key), String(file.original_filename));
  await recordAudit(String(file.vault_entry_id), fileId, user.id, 'download');
  return { download_url: downloadUrl, filename: file.original_filename, content_type: file.content_type, size_bytes: file.size_bytes };
}

export async function deleteFile(user: AuthenticatedUser, fileId: string): Promise<void> {
  const file = await requireVaultFile(fileId);
  if (!canDeleteFile(user, file)) throw new AppError(403, 'Administrator access is required.');

  try {
    await deleteObject(String(file.storage_key));
  } catch {
    await updateVaultFileStatus(fileId, { storageStatus: 'deletion_pending' });
    await recordAudit(String(file.vault_entry_id), fileId, user.id, 'file_deletion_pending');
    throw new AppError(503, 'File deletion could not be confirmed. It has been queued for retry.');
  }

  await updateVaultFileStatus(fileId, { storageStatus: 'deleted' });
  await recordAudit(String(file.vault_entry_id), fileId, user.id, 'file_deleted');
}

export async function reviewFile(user: AuthenticatedUser, fileId: string, body: unknown) {
  requireAdmin(user);
  const input = body as Record<string, unknown>;
  if (input.status !== 'available' && input.status !== 'rejected') {
    throw new AppError(400, 'status must be available or rejected.');
  }
  await approveScanResult(fileId, input.status, user.id);
  return { file_id: fileId, storage_status: input.status };
}

export async function approveScanResult(fileId: string, status: 'available' | 'rejected', actorUserId?: string): Promise<void> {
  const file = await requireVaultFile(fileId);
  if (file.storage_status !== 'quarantined') throw new AppError(409, 'File is not awaiting review.');
  if (status === 'available') {
    await updateVaultFileStatus(fileId, { storageStatus: 'available' });
    if (actorUserId) await recordAudit(String(file.vault_entry_id), fileId, actorUserId, 'file_approved');
  } else {
    try {
      await deleteObject(String(file.storage_key));
      await updateVaultFileStatus(fileId, { storageStatus: 'rejected' });
      if (actorUserId) await recordAudit(String(file.vault_entry_id), fileId, actorUserId, 'file_rejected');
    } catch {
      await updateVaultFileStatus(fileId, { storageStatus: 'deletion_pending' });
      if (actorUserId) await recordAudit(String(file.vault_entry_id), fileId, actorUserId, 'file_rejection_deletion_pending');
      throw new AppError(503, 'Rejected file deletion could not be confirmed. It has been queued for retry.');
    }
  }
}

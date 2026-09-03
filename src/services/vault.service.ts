import { pool } from '../db/connection';
import { isProjectMember } from '../db/repositories/membership.repository';
import {
  archiveVaultEntry,
  createVaultEntry,
  createVaultTag,
  deleteVaultEntry,
  deleteVaultSecret,
  findVaultEntry,
  findVaultSecret,
  findVaultTagByName,
  listVaultEntries,
  listVaultEntryTags,
  listVaultFiles,
  setVaultEntryTags,
  upsertVaultSecret,
  updateVaultEntry,
  writeVaultAuditLog,
} from '../db/repositories/vault.repository';
import { decryptSecret, encryptSecret, isEncryptionConfigured } from './encryption.service';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { isUuid, parseUuid } from '../utils/request.util';
import { requireAdmin, requireProjectAccess, requireProjectLead } from './project-access.service';

const ENTRY_TYPES = new Set(['external_link', 'markdown_note', 'credential', 'secret_key', 'file']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${field} is required.`);
  return value.trim();
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(400, 'Invalid text value.');
  return value.trim() || null;
}

function optionalIdentifier(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isUuid(value)) throw new AppError(400, 'Invalid identifier.');
  return value;
}

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function validateEntryType(type: unknown): string {
  if (typeof type !== 'string' || !ENTRY_TYPES.has(type)) throw new AppError(400, 'Invalid vault entry type.');
  return type;
}

function validateUrlHttps(url: string, field: string): void {
  try {
    if (new URL(url).protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new AppError(400, `${field} must be an HTTPS URL.`);
  }
}

async function requireVaultAccess(user: AuthenticatedUser, entryId: string) {
  const entry = await findVaultEntry(entryId);
  if (!entry || entry.archived_at) throw new AppError(404, 'Vault entry unavailable.');
  if (entry.project_id) {
    await requireProjectAccess(user, String(entry.project_id));
  }
  return entry;
}

function requireSecretAccess(user: AuthenticatedUser): void {
  requireAdmin(user);
}

async function recordAudit(entryId: string, userId: string, action: string, metadata?: Record<string, unknown>): Promise<void> {
  await writeVaultAuditLog({
    vaultEntryId: entryId,
    vaultFileId: null,
    actorUserId: userId,
    action,
    requestId: null,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
  });
}

export async function listEntries(user: AuthenticatedUser, query: { project_id?: string }) {
  const filters: { projectId?: string; includeArchived?: boolean } = { includeArchived: false };
  if (query.project_id) {
    const projectId = parseUuid(query.project_id, 'project_id must be a valid UUID.');
    await requireProjectAccess(user, projectId);
    filters.projectId = projectId;
  }
  const entriesWithAccess = await Promise.all((await listVaultEntries(filters)).map(async (entry) => ({
    entry,
    canAccess: !entry.project_id || user.role === 'admin' || await isProjectMember(user.id, String(entry.project_id)),
  })));
  const entries = entriesWithAccess.filter(({ canAccess }) => canAccess).map(({ entry }) => entry);
  return Promise.all(entries.map(async (entry) => ({
    ...entry,
    tags: await listVaultEntryTags(entry.id),
    files: entry.entry_type === 'file' ? await listVaultFiles(entry.id) : undefined,
  })));
}

export async function getEntry(user: AuthenticatedUser, entryId: string) {
  const entry = await requireVaultAccess(user, entryId);
  return {
    ...entry,
    tags: await listVaultEntryTags(entry.id),
    files: entry.entry_type === 'file' ? await listVaultFiles(entry.id) : undefined,
  };
}

export async function createEntry(user: AuthenticatedUser, body: unknown) {
  const input = body as Record<string, unknown>;
  const entryType = validateEntryType(input.entry_type);
  const title = requiredText(input.title, 'title');
  const category = optionalText(input.category);
  const projectId = optionalIdentifier(input.project_id);
  if (projectId) await requireProjectAccess(user, projectId);
  const markdownContent = optionalText(input.markdown_content);
  const externalUrl = optionalText(input.external_url);
  const secretValue = optionalText(input.secret_value);

  if (entryType === 'external_link' && externalUrl) validateUrlHttps(externalUrl, 'external_url');
  if (entryType === 'credential' || entryType === 'secret_key') {
    requireSecretAccess(user);
    if (!secretValue) throw new AppError(400, 'secret_value is required for credentials and secret keys.');
    if (!isEncryptionConfigured()) throw new AppError(503, 'Encryption is not configured.');
  }
  const encrypted = secretValue ? encryptSecret(secretValue) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const createdEntryId = await createVaultEntry({ projectId, ownerUserId: user.id, entryType, title, category, markdownContent, externalUrl });
    if (encrypted) {
      await upsertVaultSecret(createdEntryId, { encryptedValue: encrypted.encryptedValue, keyVersion: encrypted.keyVersion, nonce: encrypted.nonce, authTag: encrypted.authTag });
    }
    await recordAudit(createdEntryId, user.id, 'created');
    await client.query('COMMIT');
    return getEntry(user, createdEntryId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function updateEntry(user: AuthenticatedUser, entryId: string, body: unknown) {
  const entry = await requireVaultAccess(user, entryId);
  if (entry.entry_type === 'credential' || entry.entry_type === 'secret_key') {
    requireSecretAccess(user);
  }
  const input = body as Record<string, unknown>;
  const title = input.title === undefined ? String(entry.title) : requiredText(input.title, 'title');
  const category = input.category === undefined ? (entry.category as string) ?? null : optionalText(input.category);
  const markdownContent = input.markdown_content === undefined ? (entry.markdown_content as string) ?? null : optionalText(input.markdown_content);
  const externalUrl = input.external_url === undefined ? (entry.external_url as string) ?? null : optionalText(input.external_url);
  const secretValue = input.secret_value === undefined ? undefined : requiredText(input.secret_value, 'secret_value');
  const previousProjectId = entry.project_id ? String(entry.project_id) : null;
  const projectId = input.project_id === undefined ? previousProjectId : optionalIdentifier(input.project_id);
  if (entry.entry_type === 'external_link' && externalUrl) validateUrlHttps(externalUrl, 'external_url');
  if (projectId) await requireProjectAccess(user, projectId);
  if (input.project_id !== undefined && previousProjectId !== projectId) {
    if (previousProjectId) await requireProjectLead(user, previousProjectId);
    if (projectId) await requireProjectLead(user, projectId);
  }

  if (secretValue !== undefined && (entry.entry_type !== 'credential' && entry.entry_type !== 'secret_key')) {
    throw new AppError(400, 'secret_value is only valid for credentials and secret keys.');
  }
  if (secretValue !== undefined && !isEncryptionConfigured()) throw new AppError(503, 'Encryption is not configured.');
  const encrypted = secretValue === undefined ? null : encryptSecret(secretValue);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await updateVaultEntry(entryId, { title, category, markdownContent, externalUrl, projectId });
    if (encrypted) await upsertVaultSecret(entryId, { encryptedValue: encrypted.encryptedValue, keyVersion: encrypted.keyVersion, nonce: encrypted.nonce, authTag: encrypted.authTag });
    if (input.project_id !== undefined && previousProjectId !== projectId) {
      const action = projectId === null ? 'project_unlinked' : previousProjectId === null ? 'project_linked' : 'project_reassigned';
      await recordAudit(entryId, user.id, action, { previous_project_id: previousProjectId, project_id: projectId });
    }
    await recordAudit(entryId, user.id, 'updated');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getEntry(user, entryId);
}

export async function archiveEntry(user: AuthenticatedUser, entryId: string): Promise<void> {
  await requireVaultAccess(user, entryId);
  requireAdmin(user);
  await archiveVaultEntry(entryId);
  await recordAudit(entryId, user.id, 'archived');
}

export async function deleteEntry(user: AuthenticatedUser, entryId: string): Promise<void> {
  await requireVaultAccess(user, entryId);
  requireAdmin(user);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await archiveVaultEntry(entryId);
    await recordAudit(entryId, user.id, 'deleted');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getEntryTags(user: AuthenticatedUser, entryId: string) {
  await requireVaultAccess(user, entryId);
  return listVaultEntryTags(entryId);
}

export async function setEntryTags(user: AuthenticatedUser, entryId: string, body: unknown) {
  const entry = await requireVaultAccess(user, entryId);
  requireAdmin(user);
  const input = body as { tags?: unknown[] };
  if (!Array.isArray(input.tags)) throw new AppError(400, 'tags must be an array of strings.');
  const tagIds: string[] = [];
  for (const tagName of input.tags) {
    if (typeof tagName !== 'string' || !tagName.trim()) throw new AppError(400, 'Each tag must be a non-empty string.');
    const normalizedName = normalizeTagName(tagName);
    let tag = await findVaultTagByName(normalizedName);
    if (!tag) {
      const tagId = await createVaultTag(tagName.trim(), normalizedName);
      tag = { id: tagId, name_normalized: normalizedName, display_name: tagName.trim() };
    }
    tagIds.push(String(tag.id));
  }
  await setVaultEntryTags(entryId, tagIds);
  await recordAudit(entryId, user.id, 'tags_updated');
  return listVaultEntryTags(entryId);
}

export async function revealSecret(user: AuthenticatedUser, entryId: string) {
  requireSecretAccess(user);
  const entry = await requireVaultAccess(user, entryId);
  if (entry.entry_type !== 'credential' && entry.entry_type !== 'secret_key') {
    throw new AppError(400, 'Only credential and secret_key entries can reveal a secret.');
  }
  const secret = await findVaultSecret(entryId);
  if (!secret) throw new AppError(404, 'No secret stored for this entry.');
  if (!isEncryptionConfigured()) throw new AppError(500, 'Encryption is not configured.');

  let decrypted: string;
  try {
    decrypted = decryptSecret(
      Buffer.from(secret.encrypted_value as string),
      Buffer.from(secret.nonce as string),
      Buffer.from(secret.auth_tag as string),
      String(secret.key_version),
    );
  } catch {
    throw new AppError(500, 'Failed to decrypt secret.');
  }

  await recordAudit(entryId, user.id, 'revealed');
  return { value: decrypted };
}

export async function storeSecret(user: AuthenticatedUser, entryId: string, plaintext: string): Promise<void> {
  requireSecretAccess(user);
  const entry = await requireVaultAccess(user, entryId);
  if (entry.entry_type !== 'credential' && entry.entry_type !== 'secret_key') {
    throw new AppError(400, 'Only credential and secret_key entries can store a secret.');
  }
  if (!isEncryptionConfigured()) throw new AppError(500, 'Encryption is not configured.');
  const encrypted = encryptSecret(plaintext);
  await upsertVaultSecret(entryId, {
    encryptedValue: encrypted.encryptedValue,
    keyVersion: encrypted.keyVersion,
    nonce: encrypted.nonce,
    authTag: encrypted.authTag,
  });
  await recordAudit(entryId, user.id, 'secret_stored');
}

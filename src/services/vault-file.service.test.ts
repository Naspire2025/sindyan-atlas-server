import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';

const repository = require('../db/repositories/vault.repository') as typeof import('../db/repositories/vault.repository');
const r2 = require('./r2.service') as typeof import('./r2.service');

const admin = { id: '00000000-0000-7000-8000-000000000001', name: 'Admin', email: 'admin@example.test', role: 'admin' as const, status: 'active' as const };
const member = { id: '00000000-0000-7000-8000-000000000002', name: 'Member', email: 'member@example.test', role: 'team_member' as const, status: 'active' as const };

function installMocks(context: TestContext, overrides: Record<string, unknown> = {}) {
  const originals = new Map<string, unknown>();
  const setMock = (target: Record<string, unknown>, key: string, value: unknown) => {
    originals.set(`${key}-${originals.size}`, { target, key, value: target[key] });
    target[key] = value;
  };

  setMock(repository as unknown as Record<string, unknown>, 'findVaultEntry', async () => ({ id: '00000000-0000-7000-8000-000000000010', entry_type: 'file', project_id: null, archived_at: null }));
  setMock(repository as unknown as Record<string, unknown>, 'findVaultFile', async () => ({ id: '00000000-0000-7000-8000-000000000020', vault_entry_id: '00000000-0000-7000-8000-000000000010', storage_key: 'vault/10/mock', original_filename: 'brief.pdf', content_type: 'application/pdf', size_bytes: 100, storage_status: 'quarantined', uploaded_by_user_id: member.id }));
  setMock(repository as unknown as Record<string, unknown>, 'createVaultFile', async () => '00000000-0000-7000-8000-000000000020');
  setMock(repository as unknown as Record<string, unknown>, 'updateVaultFileStatus', async () => undefined);
  setMock(repository as unknown as Record<string, unknown>, 'writeVaultAuditLog', async () => undefined);
  setMock(r2 as unknown as Record<string, unknown>, 'isR2Configured', () => true);
  setMock(r2 as unknown as Record<string, unknown>, 'isAllowedMimeType', (contentType: string) => contentType === 'application/pdf');
  setMock(r2 as unknown as Record<string, unknown>, 'isWithinSizeLimit', (sizeBytes: number) => sizeBytes > 0 && sizeBytes <= 50 * 1024 * 1024);
  setMock(r2 as unknown as Record<string, unknown>, 'generateStorageKey', () => 'vault/10/generated');
  setMock(r2 as unknown as Record<string, unknown>, 'createSignedUploadUrl', async () => 'https://upload.example.test');
  setMock(r2 as unknown as Record<string, unknown>, 'verifyObjectExists', async () => true);
  setMock(r2 as unknown as Record<string, unknown>, 'createSignedDownloadUrl', async () => 'https://download.example.test');
  setMock(r2 as unknown as Record<string, unknown>, 'deleteObject', async () => undefined);

  for (const [key, value] of Object.entries(overrides)) {
    const target = key.startsWith('r2.') ? r2 : repository;
    setMock(target as unknown as Record<string, unknown>, key.replace(/^r2\./, ''), value);
  }

  context.after(() => {
    for (const original of [...originals.values()].reverse() as Array<{ target: Record<string, unknown>; key: string; value: unknown }>) {
      original.target[original.key] = original.value;
    }
  });
}

test('createUploadIntent validates file entries before returning a signed upload URL', async (context) => {
  installMocks(context);
  delete require.cache[require.resolve('./vault-file.service')];
  const { createUploadIntent } = require('./vault-file.service') as typeof import('./vault-file.service');

  const intent = await createUploadIntent(member, '00000000-0000-7000-8000-000000000010', { filename: ' Client Brief.pdf ', content_type: 'application/pdf', size_bytes: 100 });

  assert.equal(intent.file_id, '00000000-0000-7000-8000-000000000020');
  assert.equal(intent.upload_url, 'https://upload.example.test');
  assert.equal('storage_key' in intent, false);
});

test('createUploadIntent rejects unsupported files and non-file vault entries', async (context) => {
  installMocks(context);
  delete require.cache[require.resolve('./vault-file.service')];
  const { createUploadIntent } = require('./vault-file.service') as typeof import('./vault-file.service');

  await assert.rejects(
    createUploadIntent(member, '00000000-0000-7000-8000-000000000010', { filename: 'brief.exe', content_type: 'application/octet-stream', size_bytes: 100 }),
    { message: 'File type is not allowed.' },
  );
  await assert.rejects(
    createUploadIntent(member, '00000000-0000-7000-8000-000000000010', { filename: 'empty.pdf', content_type: 'application/pdf', size_bytes: 0 }),
    { message: 'size_bytes must be a positive integer.' },
  );
});

test('reviewFile only allows admins to move quarantined files through review', async (context) => {
  const statuses: string[] = [];
  installMocks(context, {
    updateVaultFileStatus: async (_fileId: string, input: { storageStatus: string }) => {
      statuses.push(input.storageStatus);
    },
  });
  delete require.cache[require.resolve('./vault-file.service')];
  const { reviewFile } = require('./vault-file.service') as typeof import('./vault-file.service');

  await assert.rejects(reviewFile(member, '00000000-0000-7000-8000-000000000020', { status: 'available' }), { message: 'Administrator access is required.' });
  assert.deepEqual(await reviewFile(admin, '00000000-0000-7000-8000-000000000020', { status: 'available' }), { file_id: '00000000-0000-7000-8000-000000000020', storage_status: 'available' });
  assert.deepEqual(statuses, ['available']);
});

test('deleteFile tracks deletion_pending when object deletion cannot be confirmed', async (context) => {
  const statuses: string[] = [];
  installMocks(context, {
    'r2.deleteObject': async () => {
      throw new Error('R2 unavailable');
    },
    updateVaultFileStatus: async (_fileId: string, input: { storageStatus: string }) => {
      statuses.push(input.storageStatus);
    },
  });
  delete require.cache[require.resolve('./vault-file.service')];
  const { deleteFile } = require('./vault-file.service') as typeof import('./vault-file.service');

  await assert.rejects(deleteFile(admin, '00000000-0000-7000-8000-000000000020'), { message: 'File deletion could not be confirmed. It has been queued for retry.' });
  assert.deepEqual(statuses, ['deletion_pending']);
});

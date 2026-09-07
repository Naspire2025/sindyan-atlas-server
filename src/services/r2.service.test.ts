import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FILE_STORAGE_ENABLED = 'true';
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';

const { createSignedUploadUrl } = require('./r2.service') as typeof import('./r2.service');

test('createSignedUploadUrl does not sign an empty-body checksum', async () => {
  const signedUrl = new URL(
    await createSignedUploadUrl('vault/entry/file', 'application/pdf', 128),
  );

  assert.equal(signedUrl.searchParams.has('x-amz-checksum-crc32'), false);
  assert.equal(signedUrl.searchParams.has('x-amz-sdk-checksum-algorithm'), false);
  assert.equal(
    signedUrl.searchParams.get('X-Amz-Content-Sha256'),
    'UNSIGNED-PAYLOAD',
  );
});

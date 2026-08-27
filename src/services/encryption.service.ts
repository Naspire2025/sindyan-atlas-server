import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = process.env.VAULT_KEY_VERSION ?? 'v1';
const ENCRYPTION_KEY_HEX = process.env.VAULT_ENCRYPTION_KEY;

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY_HEX) throw new Error('VAULT_ENCRYPTION_KEY environment variable is required.');
  const key = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
  if (key.length !== 32) throw new Error('VAULT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  return key;
}

export type EncryptedPayload = {
  encryptedValue: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: string;
};

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encryptedValue: encrypted, nonce, authTag, keyVersion: KEY_VERSION };
}

export function decryptSecret(encryptedValue: Buffer, nonce: Buffer, authTag: Buffer, keyVersion: string): string {
  if (keyVersion !== KEY_VERSION) throw new Error('Key version mismatch. Re-encryption may be required.');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedValue), decipher.final()]);
  return decrypted.toString('utf8');
}

export function isEncryptionConfigured(): boolean {
  return Boolean(ENCRYPTION_KEY_HEX);
}

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { env } from '../config/env';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const SIGNED_URL_EXPIRY_SECONDS = 60 * 15;
const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

let cachedClient: S3Client | undefined;

function requireR2Config(): void {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error('R2 configuration is incomplete. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.');
  }
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  requireR2Config();
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
  });
  return cachedClient;
}

export function generateStorageKey(entryId: string): string {
  const uuid = crypto.randomUUID();
  return `vault/${entryId}/${uuid}`;
}

export function isAllowedMimeType(contentType: string): boolean {
  return ALLOWED_MIME_TYPES.has(contentType);
}

export function isWithinSizeLimit(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_BYTES;
}

export async function createSignedUploadUrl(storageKey: string, contentType: string, sizeBytes: number): Promise<string> {
  requireR2Config();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: storageKey,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_EXPIRY_SECONDS });
}

export async function verifyObjectExists(storageKey: string, expectedSize: number): Promise<boolean> {
  requireR2Config();
  try {
    const command = new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: storageKey });
    const response = await getClient().send(command);
    return response.ContentLength === expectedSize;
  } catch {
    return false;
  }
}

export async function createSignedDownloadUrl(storageKey: string, filename: string): Promise<string> {
  requireR2Config();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });
  return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_EXPIRY_SECONDS });
}

export async function deleteObject(storageKey: string): Promise<void> {
  requireR2Config();
  const command = new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: storageKey });
  await getClient().send(command);
}

export function isR2Configured(): boolean {
  return Boolean(env.fileStorageEnabled && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

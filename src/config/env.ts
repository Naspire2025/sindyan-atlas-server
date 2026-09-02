const DEFAULT_FRONTEND_ORIGIN = "http://localhost:5173";

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return numberValue;
}

function readOrigins(): string[] {
  const rawOrigins = process.env.FRONTEND_ORIGINS ?? DEFAULT_FRONTEND_ORIGIN;
  const origins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0)
    throw new Error("FRONTEND_ORIGINS must include at least one origin.");
  return origins;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function hasAnyR2Variable(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID ||
    process.env.R2_ACCESS_KEY_ID ||
    process.env.R2_SECRET_ACCESS_KEY ||
    process.env.R2_BUCKET_NAME,
  );
}

function validateR2Configuration(fileStorageEnabled: boolean): void {
  if (!fileStorageEnabled) return;
  const missing = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ].filter((name) => !process.env[name]);
  if (missing.length > 0)
    throw new Error(
      `File storage is enabled but missing: ${missing.join(", ")}.`,
    );
}

const fileStorageEnabled = readBoolean(
  "FILE_STORAGE_ENABLED",
  hasAnyR2Variable(),
);
validateR2Configuration(fileStorageEnabled);

export const env = {
  host: process.env.HOST ?? "127.0.0.1",
  port: readPositiveInteger("PORT", 8080),
  isProduction: process.env.NODE_ENV === "production",
  frontendOrigins: readOrigins(),
  trustProxy: 1,
  sessionIdleHours: readPositiveInteger("SESSION_IDLE_HOURS", 12),
  sessionAbsoluteDays: readPositiveInteger("SESSION_ABSOLUTE_DAYS", 14),
  taskStalledDays: readPositiveInteger("TASK_STALLED_DAYS", 7),
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim(),
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME?.trim(),
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  invitationDeliveryWebhookUrl:
    process.env.INVITATION_DELIVERY_WEBHOOK_URL?.trim(),
  frontendAppUrl: process.env.FRONTEND_APP_URL?.trim(),
  fileStorageEnabled,
};

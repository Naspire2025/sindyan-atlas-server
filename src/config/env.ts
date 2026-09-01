const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';

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
  const origins = rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error('FRONTEND_ORIGINS must include at least one origin.');
  return origins;
}

export const env = {
  host: process.env.HOST ?? '127.0.0.1',
  port: readPositiveInteger('PORT', 3001),
  isProduction: process.env.NODE_ENV === 'production',
  frontendOrigins: readOrigins(),
  trustProxy: 1,
  sessionIdleHours: readPositiveInteger('SESSION_IDLE_HOURS', 12),
  sessionAbsoluteDays: readPositiveInteger('SESSION_ABSOLUTE_DAYS', 14),
  taskStalledDays: readPositiveInteger('TASK_STALLED_DAYS', 7),
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim(),
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME?.trim(),
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  invitationDeliveryWebhookUrl: process.env.INVITATION_DELIVERY_WEBHOOK_URL?.trim(),
  frontendAppUrl: process.env.FRONTEND_APP_URL?.trim(),
};

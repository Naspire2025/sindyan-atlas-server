import { AppError } from './app-error.util';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function parseUuid(value: string | string[] | undefined, message = 'Resource unavailable.'): string {
  if (typeof value !== 'string' || !isUuid(value)) throw new AppError(404, message);
  return value;
}

export function requireUser(requestUser: Express.Request['user']) {
  if (!requestUser) throw new AppError(401, 'Authentication is required.');
  return requestUser;
}

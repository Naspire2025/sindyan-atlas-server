import { AppError } from './app-error.util';

export function parsePositiveId(value: string | string[] | undefined): number {
  if (typeof value !== 'string') throw new AppError(404, 'Resource unavailable.');
  const identifier = Number(value);
  if (!Number.isInteger(identifier) || identifier <= 0) {
    throw new AppError(404, 'Resource unavailable.');
  }
  return identifier;
}

export function requireUser(requestUser: Express.Request['user']) {
  if (!requestUser) throw new AppError(401, 'Authentication is required.');
  return requestUser;
}

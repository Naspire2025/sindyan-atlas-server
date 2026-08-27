import type { NextFunction, Request, Response } from 'express';
import { findSessionIdentity } from '../db/repositories/session.repository';
import { AppError } from '../utils/app-error.util';
import { hashToken } from '../utils/token.util';
import { env } from '../config/env';

function isTrustedOrigin(origin: string | undefined): boolean {
  return typeof origin === 'string' && env.frontendOrigins.includes(origin);
}

export async function requireCsrf(request: Request, _response: Response, next: NextFunction): Promise<void> {
  if (!isTrustedOrigin(request.get('origin'))) {
    next(new AppError(403, 'Request origin is not allowed.'));
    return;
  }

  const token = request.get('x-csrf-token');
  const sessionToken = request.cookies?.[env.sessionCookieName];
  if (!request.sessionId || typeof token !== 'string' || typeof sessionToken !== 'string') {
    next(new AppError(403, 'CSRF validation failed.'));
    return;
  }

  const session = await findSessionIdentity(hashToken(sessionToken));
  if (!session || session.sessionId !== request.sessionId || session.csrfTokenHash !== hashToken(token)) {
    next(new AppError(403, 'CSRF validation failed.'));
    return;
  }
  next();
}

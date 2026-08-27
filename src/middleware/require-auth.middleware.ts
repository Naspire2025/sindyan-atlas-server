import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { findSessionIdentity, touchSession } from '../db/repositories/session.repository';
import { AppError } from '../utils/app-error.util';
import { hashToken } from '../utils/token.util';

function calculateIdleExpiry(absoluteExpiresAt: string): string {
  const absoluteExpiry = new Date(absoluteExpiresAt);
  const idleExpiry = new Date(Date.now() + env.sessionIdleHours * 60 * 60 * 1000);
  return (idleExpiry < absoluteExpiry ? idleExpiry : absoluteExpiry).toISOString();
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const token = request.cookies?.[env.sessionCookieName];
  if (typeof token !== 'string' || token.length === 0) {
    next(new AppError(401, 'Authentication is required.'));
    return;
  }

  const session = await findSessionIdentity(hashToken(token));
  if (!session || session.status !== 'active') {
    next(new AppError(401, 'Authentication is required.'));
    return;
  }

  await touchSession(session.sessionId, calculateIdleExpiry(session.absoluteExpiresAt));
  request.user = { id: session.id, name: session.name, email: session.email, role: session.role, status: session.status };
  request.sessionId = session.sessionId;
  next();
}

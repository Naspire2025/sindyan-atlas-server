import type { Request, Response, NextFunction } from 'express';
import type { CookieOptions } from 'express';
import { env } from '../config/env';
import { revokeSession, updateCsrfToken } from '../db/repositories/session.repository';
import { acceptInvitationToken, changePassword, inviteUser, login, resendInvitation, revokePendingInvitation } from '../services/auth.service';
import { AppError } from '../utils/app-error.util';
import { createOpaqueToken, hashToken } from '../utils/token.util';

function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    expires: expiresAt,
    path: '/',
  };
}

function writeSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(env.sessionCookieName, token, sessionCookieOptions(expiresAt));
}

function requireLoginInput(body: unknown): { email: string; password: string } {
  const input = body as { email?: unknown; password?: unknown };
  if (typeof input?.email !== 'string' || typeof input.password !== 'string' || !input.email.trim() || !input.password) {
    throw new AppError(400, 'email and password are required.');
  }
  return { email: input.email, password: input.password };
}

export async function loginController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const result = await login(requireLoginInput(request.body));
    writeSessionCookie(response, result.session.token, result.session.expiresAt);
    response.status(200).json({ user: result.user, csrfToken: result.session.csrfToken });
  } catch (error) {
    next(error);
  }
}

export async function acceptInvitationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const token = request.params.token;
    const password = (request.body as { password?: unknown }).password;
    if (typeof token !== 'string') throw new AppError(401, 'Invitation is invalid or expired.');
    const result = await acceptInvitationToken(token, password);
    writeSessionCookie(response, result.session.token, result.session.expiresAt);
    response.status(201).json({ user: result.user, csrfToken: result.session.csrfToken });
  } catch (error) {
    next(error);
  }
}

export async function inviteUserController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, 'Authentication is required.');
    await inviteUser(request.user, request.body);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function changePasswordController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, 'Authentication is required.');
    const body = request.body as { current_password?: unknown; new_password?: unknown };
    const session = await changePassword(request.user, body.current_password, body.new_password);
    writeSessionCookie(response, session.token, session.expiresAt);
    response.json({ csrfToken: session.csrfToken });
  } catch (error) { next(error); }
}

export async function resendInvitationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, 'Authentication is required.');
    const invitationId = Number(request.params.id);
    if (!Number.isInteger(invitationId) || invitationId <= 0) throw new AppError(404, 'Invitation unavailable.');
    await resendInvitation(request.user, invitationId);
    response.status(204).send();
  } catch (error) { next(error); }
}

export function revokeInvitationController(request: Request, response: Response, next: NextFunction): void {
  try {
    if (!request.user) throw new AppError(401, 'Authentication is required.');
    const invitationId = Number(request.params.id);
    if (!Number.isInteger(invitationId) || invitationId <= 0) throw new AppError(404, 'Invitation unavailable.');
    revokePendingInvitation(request.user, invitationId);
    response.status(204).send();
  } catch (error) { next(error); }
}

export function logoutController(request: Request, response: Response): void {
  if (request.sessionId) revokeSession(request.sessionId);
  const { expires: _expires, ...clearOptions } = sessionCookieOptions(new Date(0));
  response.clearCookie(env.sessionCookieName, clearOptions);
  response.status(204).send();
}

export function currentUserController(request: Request, response: Response): void {
  response.json({ user: request.user });
}

export function csrfTokenController(request: Request, response: Response, next: NextFunction): void {
  if (!request.sessionId) {
    next(new AppError(401, 'Authentication is required.'));
    return;
  }
  const csrfToken = createOpaqueToken();
  updateCsrfToken(request.sessionId, hashToken(csrfToken));
  response.json({ csrfToken });
}

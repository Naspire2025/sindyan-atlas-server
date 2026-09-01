import type { Request, Response, NextFunction } from 'express';
import { revokeSession } from '../db/repositories/session.repository';
import { acceptInvitationToken, changePassword, inviteUser, login, resendInvitation, revokePendingInvitation } from '../services/auth.service';
import { AppError } from '../utils/app-error.util';

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
    response.status(200).json({ user: result.user, token: result.session.token });
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
    response.status(201).json({ user: result.user, token: result.session.token });
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
    response.json({ token: session.token });
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
  response.status(204).send();
}

export function currentUserController(request: Request, response: Response): void {
  response.json({ user: request.user });
}

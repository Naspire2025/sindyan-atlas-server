import type { NextFunction, Request, Response } from 'express';
import { getMemberSummary, getOrganizationUser, listOrganizationUsers, updateOrganizationUser } from '../services/user.service';
import { listInvitationSummaries } from '../services/auth.service';
import { parseUuid, requireUser } from '../utils/request.util';

export async function listUsersController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listOrganizationUsers(requireUser(request.user))); } catch (error) { next(error); }
}

export async function getUserController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getOrganizationUser(requireUser(request.user), parseUuid(request.params.id))); } catch (error) { next(error); }
}

export async function getMemberSummaryController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getMemberSummary(requireUser(request.user), parseUuid(request.params.userId))); } catch (error) { next(error); }
}

export async function updateUserController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateOrganizationUser(requireUser(request.user), parseUuid(request.params.id), request.body)); } catch (error) { next(error); }
}

export async function listInvitationsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    await listOrganizationUsers(requireUser(request.user));
    response.json(await listInvitationSummaries());
  } catch (error) { next(error); }
}

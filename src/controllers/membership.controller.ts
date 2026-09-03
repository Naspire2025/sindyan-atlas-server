import type { NextFunction, Request, Response } from 'express';
import { listProjectMembers } from '../db/repositories/project.repository';
import { addMemberToProject, removeMemberFromProject } from '../services/membership.service';
import { requireProjectAccess } from '../services/project-access.service';
import { parseUuid, requireUser } from '../utils/request.util';

export async function listProjectMembersController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = parseUuid(request.params.projectId);
    await requireProjectAccess(requireUser(request.user), projectId);
    response.json(await listProjectMembers(projectId));
  } catch (error) {
    next(error);
  }
}

export async function addProjectMemberController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = parseUuid(request.params.projectId);
    await addMemberToProject(requireUser(request.user), projectId, request.body);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function removeProjectMemberController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = parseUuid(request.params.projectId);
    const userId = parseUuid(request.params.userId);
    await removeMemberFromProject(requireUser(request.user), projectId, userId);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

import type { NextFunction, Request, Response } from 'express';
import { findProject, listProjectMembers, listProjectMilestones, listProjectsForUser, listProjectTasks } from '../db/repositories/project.repository';
import { requireProjectAccess } from '../services/project-access.service';
import { AppError } from '../utils/app-error.util';
import { parsePositiveId, requireUser } from '../utils/request.util';
import { createProject, deleteProject, updateProject } from '../services/project.service';
import { listProjectLinks, listProjectPhases } from '../services/project-planning.service';

export async function listProjectsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(request.user);
    response.json(await listProjectsForUser(user.id, user.role === 'admin'));
  } catch (error) {
    next(error);
  }
}

export async function getProjectController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = parsePositiveId(request.params.id);
    const project = await findProject(projectId);
    if (!project) throw new AppError(404, 'Project unavailable.');
    await requireProjectAccess(requireUser(request.user), projectId);
    const user = requireUser(request.user);
    response.json({
      ...project,
      tasks: await listProjectTasks(projectId),
      milestones: await listProjectMilestones(projectId),
      team_members: await listProjectMembers(projectId),
      links: await listProjectLinks(user, projectId),
      phases: await listProjectPhases(user, projectId),
    });
  } catch (error) {
    next(error);
  }
}

export async function createProjectController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.status(201).json(await createProject(requireUser(request.user), request.body));
  } catch (error) {
    next(error);
  }
}

export async function updateProjectController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await updateProject(requireUser(request.user), parsePositiveId(request.params.id), request.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteProjectController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    await deleteProject(requireUser(request.user), parsePositiveId(request.params.id));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

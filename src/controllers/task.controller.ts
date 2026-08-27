import type { NextFunction, Request, Response } from 'express';
import { findTask, listTaskActivity, listTaskComments, listTasksForUser } from '../db/repositories/task.repository';
import { addTaskComment, createTask, deleteTask, updateTask } from '../services/task.service';
import { requireProjectAccess } from '../services/project-access.service';
import { AppError } from '../utils/app-error.util';
import { parsePositiveId, requireUser } from '../utils/request.util';

export async function listTasksController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(request.user);
    response.json(await listTasksForUser(user.id, user.role === 'admin'));
  } catch (error) {
    next(error);
  }
}

export async function getTaskController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const task = await findTask(parsePositiveId(request.params.id));
    if (!task) throw new AppError(404, 'Task unavailable.');
    const projectRole = await requireProjectAccess(requireUser(request.user), task.project_id);
    response.json({ ...task, project_role: projectRole, comments: await listTaskComments(task.id), activity: await listTaskActivity(task.id) });
  } catch (error) {
    next(error);
  }
}

export async function listTaskActivityController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const task = await findTask(parsePositiveId(request.params.id));
    if (!task) throw new AppError(404, 'Task unavailable.');
    await requireProjectAccess(requireUser(request.user), task.project_id);
    response.json(await listTaskActivity(task.id));
  } catch (error) { next(error); }
}

export async function createTaskController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.status(201).json(await createTask(requireUser(request.user), request.body));
  } catch (error) {
    next(error);
  }
}

export async function updateTaskController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await updateTask(requireUser(request.user), parsePositiveId(request.params.id), request.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteTaskController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    await deleteTask(requireUser(request.user), parsePositiveId(request.params.id));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function createTaskCommentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.status(201).json(await addTaskComment(requireUser(request.user), parsePositiveId(request.params.id), request.body));
  } catch (error) {
    next(error);
  }
}

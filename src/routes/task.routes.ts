import { Router } from 'express';
import {
  createTaskCommentController,
  createTaskController,
  deleteTaskController,
  getTaskController,
  listTaskActivityController,
  listTasksController,
  updateTaskController,
} from '../controllers/task.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const taskRouter = Router();

taskRouter.get('/', requireAuth, listTasksController);
taskRouter.get('/:id', requireAuth, getTaskController);
taskRouter.get('/:id/activity', requireAuth, listTaskActivityController);
taskRouter.post('/', requireAuth, requireCsrf, createTaskController);
taskRouter.put('/:id', requireAuth, requireCsrf, updateTaskController);
taskRouter.delete('/:id', requireAuth, requireCsrf, deleteTaskController);
taskRouter.post('/:id/comments', requireAuth, requireCsrf, createTaskCommentController);

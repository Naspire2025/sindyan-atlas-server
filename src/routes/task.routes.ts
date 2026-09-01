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

export const taskRouter = Router();

taskRouter.get('/', requireAuth, listTasksController);
taskRouter.get('/:id', requireAuth, getTaskController);
taskRouter.get('/:id/activity', requireAuth, listTaskActivityController);
taskRouter.post('/', requireAuth, createTaskController);
taskRouter.put('/:id', requireAuth, updateTaskController);
taskRouter.delete('/:id', requireAuth, deleteTaskController);
taskRouter.post('/:id/comments', requireAuth, createTaskCommentController);

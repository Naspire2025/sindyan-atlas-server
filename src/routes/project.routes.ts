import { Router } from 'express';
import {
  createProjectController,
  deleteProjectController,
  getProjectController,
  listProjectsController,
  updateProjectController,
} from '../controllers/project.controller';
import { requireAuth } from '../middleware/require-auth.middleware';

export const projectRouter = Router();

projectRouter.get('/', requireAuth, listProjectsController);
projectRouter.get('/:id', requireAuth, getProjectController);
projectRouter.post('/', requireAuth, createProjectController);
projectRouter.put('/:id', requireAuth, updateProjectController);
projectRouter.delete('/:id', requireAuth, deleteProjectController);

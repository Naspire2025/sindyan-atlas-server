import { Router } from 'express';
import {
  createProjectController,
  deleteProjectController,
  getProjectController,
  listProjectsController,
  updateProjectController,
} from '../controllers/project.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const projectRouter = Router();

projectRouter.get('/', requireAuth, listProjectsController);
projectRouter.get('/:id', requireAuth, getProjectController);
projectRouter.post('/', requireAuth, requireCsrf, createProjectController);
projectRouter.put('/:id', requireAuth, requireCsrf, updateProjectController);
projectRouter.delete('/:id', requireAuth, requireCsrf, deleteProjectController);

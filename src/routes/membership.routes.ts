import { Router } from 'express';
import {
  addProjectMemberController,
  listProjectMembersController,
  removeProjectMemberController,
} from '../controllers/membership.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const membershipRouter = Router({ mergeParams: true });

membershipRouter.get('/', requireAuth, listProjectMembersController);
membershipRouter.post('/', requireAuth, requireCsrf, addProjectMemberController);
membershipRouter.delete('/:userId', requireAuth, requireCsrf, removeProjectMemberController);

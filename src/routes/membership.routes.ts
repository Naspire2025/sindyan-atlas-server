import { Router } from 'express';
import {
  addProjectMemberController,
  listProjectMembersController,
  removeProjectMemberController,
} from '../controllers/membership.controller';
import { requireAuth } from '../middleware/require-auth.middleware';

export const membershipRouter = Router({ mergeParams: true });

membershipRouter.get('/', requireAuth, listProjectMembersController);
membershipRouter.post('/', requireAuth, addProjectMemberController);
membershipRouter.delete('/:userId', requireAuth, removeProjectMemberController);

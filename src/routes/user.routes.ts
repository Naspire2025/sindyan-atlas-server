import { Router } from 'express';
import { getUserController, listInvitationsController, listUsersController, updateUserController } from '../controllers/user.controller';
import { createAvailabilityController, createCapacityProfileController, deleteAvailabilityController, listAvailabilityController, listCapacityProfilesController, updateAvailabilityController, updateCapacityProfileController } from '../controllers/resource.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const userRouter = Router();

userRouter.get('/', requireAuth, listUsersController);
userRouter.get('/invitations', requireAuth, listInvitationsController);
userRouter.get('/:id', requireAuth, getUserController);
userRouter.patch('/:id', requireAuth, requireCsrf, updateUserController);

userRouter.get('/:userId/capacity-profiles', requireAuth, listCapacityProfilesController);
userRouter.post('/:userId/capacity-profiles', requireAuth, requireCsrf, createCapacityProfileController);
userRouter.patch('/:userId/capacity-profiles/:profileId', requireAuth, requireCsrf, updateCapacityProfileController);
userRouter.get('/:userId/availability', requireAuth, listAvailabilityController);
userRouter.post('/:userId/availability', requireAuth, requireCsrf, createAvailabilityController);
userRouter.patch('/:userId/availability/:availabilityId', requireAuth, requireCsrf, updateAvailabilityController);
userRouter.delete('/:userId/availability/:availabilityId', requireAuth, requireCsrf, deleteAvailabilityController);

import { Router } from 'express';
import { getMemberSummaryController, getUserController, listInvitationsController, listUsersController, updateUserController } from '../controllers/user.controller';
import { createAvailabilityController, createCapacityProfileController, deleteAvailabilityController, listAvailabilityController, listCapacityProfilesController, updateAvailabilityController, updateCapacityProfileController } from '../controllers/resource.controller';
import { requireAuth } from '../middleware/require-auth.middleware';

export const userRouter = Router();

userRouter.get('/', requireAuth, listUsersController);
userRouter.get('/invitations', requireAuth, listInvitationsController);
userRouter.get('/:userId/summary', requireAuth, getMemberSummaryController);
userRouter.get('/:id', requireAuth, getUserController);
userRouter.patch('/:id', requireAuth, updateUserController);

userRouter.get('/:userId/capacity-profiles', requireAuth, listCapacityProfilesController);
userRouter.post('/:userId/capacity-profiles', requireAuth, createCapacityProfileController);
userRouter.patch('/:userId/capacity-profiles/:profileId', requireAuth, updateCapacityProfileController);
userRouter.get('/:userId/availability', requireAuth, listAvailabilityController);
userRouter.post('/:userId/availability', requireAuth, createAvailabilityController);
userRouter.patch('/:userId/availability/:availabilityId', requireAuth, updateAvailabilityController);
userRouter.delete('/:userId/availability/:availabilityId', requireAuth, deleteAvailabilityController);

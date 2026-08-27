import { Router } from 'express';
import {
  createAssetAllocationController,
  createAssetController,
  createAvailabilityController,
  createCapacityProfileController,
  createMemberAllocationController,
  deleteAssetAllocationController,
  deleteAssetController,
  deleteAvailabilityController,
  deleteMemberAllocationController,
  listAssetAllocationsController,
  listAssetsController,
  listAvailabilityController,
  listCapacityProfilesController,
  listMemberAllocationsController,
  projectAllocationsController,
  updateAssetAllocationController,
  updateAssetController,
  updateAvailabilityController,
  updateCapacityProfileController,
  updateMemberAllocationController,
  workloadController,
} from '../controllers/resource.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const userCapacityRouter = Router({ mergeParams: true });
export const memberAllocationRouter = Router();
export const assetRouter = Router();
export const assetAllocationRouter = Router();
export const resourceRouter = Router();
export const projectAllocationRouter = Router({ mergeParams: true });

userCapacityRouter.get('/capacity-profiles', requireAuth, listCapacityProfilesController);
userCapacityRouter.post('/capacity-profiles', requireAuth, requireCsrf, createCapacityProfileController);
userCapacityRouter.patch('/capacity-profiles/:profileId', requireAuth, requireCsrf, updateCapacityProfileController);
userCapacityRouter.get('/availability', requireAuth, listAvailabilityController);
userCapacityRouter.post('/availability', requireAuth, requireCsrf, createAvailabilityController);
userCapacityRouter.patch('/availability/:availabilityId', requireAuth, requireCsrf, updateAvailabilityController);
userCapacityRouter.delete('/availability/:availabilityId', requireAuth, requireCsrf, deleteAvailabilityController);

memberAllocationRouter.get('/', requireAuth, listMemberAllocationsController);
memberAllocationRouter.post('/', requireAuth, requireCsrf, createMemberAllocationController);
memberAllocationRouter.patch('/:allocationId', requireAuth, requireCsrf, updateMemberAllocationController);
memberAllocationRouter.delete('/:allocationId', requireAuth, requireCsrf, deleteMemberAllocationController);

assetRouter.get('/', requireAuth, listAssetsController);
assetRouter.post('/', requireAuth, requireCsrf, createAssetController);
assetRouter.patch('/:assetId', requireAuth, requireCsrf, updateAssetController);
assetRouter.delete('/:assetId', requireAuth, requireCsrf, deleteAssetController);

assetAllocationRouter.get('/', requireAuth, listAssetAllocationsController);
assetAllocationRouter.post('/', requireAuth, requireCsrf, createAssetAllocationController);
assetAllocationRouter.patch('/:allocationId', requireAuth, requireCsrf, updateAssetAllocationController);
assetAllocationRouter.delete('/:allocationId', requireAuth, requireCsrf, deleteAssetAllocationController);

resourceRouter.get('/workload', requireAuth, workloadController);

projectAllocationRouter.get('/allocations', requireAuth, projectAllocationsController);

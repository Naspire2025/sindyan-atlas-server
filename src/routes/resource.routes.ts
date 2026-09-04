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
  listAllCapacityProfilesController,
  listAssetAllocationsController,
  listAssetsController,
  listAvailabilityController,
  listCapacityProfilesController,
  listMemberAllocationsController,
  projectAllocationsController,
  projectWorkloadController,
  updateAssetAllocationController,
  updateAssetController,
  updateAvailabilityController,
  updateCapacityProfileController,
  updateMemberAllocationController,
  workloadController,
} from '../controllers/resource.controller';
import { requireAuth } from '../middleware/require-auth.middleware';

export const userCapacityRouter = Router({ mergeParams: true });
export const memberAllocationRouter = Router();
export const assetRouter = Router();
export const assetAllocationRouter = Router();
export const resourceRouter = Router();
export const projectAllocationRouter = Router({ mergeParams: true });

userCapacityRouter.get('/capacity-profiles', requireAuth, listCapacityProfilesController);
userCapacityRouter.post('/capacity-profiles', requireAuth, createCapacityProfileController);
userCapacityRouter.patch('/capacity-profiles/:profileId', requireAuth, updateCapacityProfileController);
userCapacityRouter.get('/availability', requireAuth, listAvailabilityController);
userCapacityRouter.post('/availability', requireAuth, createAvailabilityController);
userCapacityRouter.patch('/availability/:availabilityId', requireAuth, updateAvailabilityController);
userCapacityRouter.delete('/availability/:availabilityId', requireAuth, deleteAvailabilityController);

memberAllocationRouter.get('/', requireAuth, listMemberAllocationsController);
memberAllocationRouter.post('/', requireAuth, createMemberAllocationController);
memberAllocationRouter.patch('/:allocationId', requireAuth, updateMemberAllocationController);
memberAllocationRouter.delete('/:allocationId', requireAuth, deleteMemberAllocationController);

assetRouter.get('/', requireAuth, listAssetsController);
assetRouter.post('/', requireAuth, createAssetController);
assetRouter.patch('/:assetId', requireAuth, updateAssetController);
assetRouter.delete('/:assetId', requireAuth, deleteAssetController);

assetAllocationRouter.get('/', requireAuth, listAssetAllocationsController);
assetAllocationRouter.post('/', requireAuth, createAssetAllocationController);
assetAllocationRouter.patch('/:allocationId', requireAuth, updateAssetAllocationController);
assetAllocationRouter.delete('/:allocationId', requireAuth, deleteAssetAllocationController);

resourceRouter.get('/workload', requireAuth, workloadController);
resourceRouter.get('/capacity-profiles', requireAuth, listAllCapacityProfilesController);

projectAllocationRouter.get('/allocations', requireAuth, projectAllocationsController);
projectAllocationRouter.get('/workload', requireAuth, projectWorkloadController);

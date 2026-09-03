import type { NextFunction, Request, Response } from 'express';
import {
  createAssetAllocationRecord,
  createAssetRecord,
  createAvailabilityRecord,
  createCapacityProfileRecord,
  createMemberAllocationRecord,
  deleteAssetAllocationRecord,
  deleteAssetRecord,
  deleteAvailabilityRecord,
  deleteMemberAllocationRecord,
  getProjectAllocationView,
  getWorkloadView,
  listAssetAllocationRecords,
  listAssetRecords,
  listUserAvailability,
  listUserCapacityProfiles,
  listMemberAllocationRecords,
  updateAssetAllocationRecord,
  updateAssetRecord,
  updateAvailabilityRecord,
  updateCapacityProfileRecord,
  updateMemberAllocationRecord,
} from '../services/resource.service';
import { parseUuid, requireUser } from '../utils/request.util';

function userId(request: Request): string { return parseUuid(request.params.userId); }

export async function listCapacityProfilesController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listUserCapacityProfiles(requireUser(request.user), userId(request))); } catch (error) { next(error); }
}

export async function createCapacityProfileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createCapacityProfileRecord(requireUser(request.user), userId(request), request.body)); } catch (error) { next(error); }
}

export async function updateCapacityProfileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateCapacityProfileRecord(requireUser(request.user), parseUuid(request.params.profileId), request.body)); } catch (error) { next(error); }
}

export async function listAvailabilityController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listUserAvailability(requireUser(request.user), userId(request))); } catch (error) { next(error); }
}

export async function createAvailabilityController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createAvailabilityRecord(requireUser(request.user), userId(request), request.body)); } catch (error) { next(error); }
}

export async function updateAvailabilityController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateAvailabilityRecord(requireUser(request.user), parseUuid(request.params.availabilityId), request.body)); } catch (error) { next(error); }
}

export async function deleteAvailabilityController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteAvailabilityRecord(requireUser(request.user), parseUuid(request.params.availabilityId)); response.status(204).send(); } catch (error) { next(error); }
}

export async function listMemberAllocationsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listMemberAllocationRecords(requireUser(request.user), request.query as { project_id?: string; user_id?: string })); } catch (error) { next(error); }
}

export async function createMemberAllocationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createMemberAllocationRecord(requireUser(request.user), request.body)); } catch (error) { next(error); }
}

export async function updateMemberAllocationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateMemberAllocationRecord(requireUser(request.user), parseUuid(request.params.allocationId), request.body)); } catch (error) { next(error); }
}

export async function deleteMemberAllocationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteMemberAllocationRecord(requireUser(request.user), parseUuid(request.params.allocationId)); response.status(204).send(); } catch (error) { next(error); }
}

export async function listAssetsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listAssetRecords(requireUser(request.user))); } catch (error) { next(error); }
}

export async function createAssetController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createAssetRecord(requireUser(request.user), request.body)); } catch (error) { next(error); }
}

export async function getAssetController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const asset = requireUser(request.user) && (undefined as unknown as Record<string, unknown>);
    response.json(asset);
  } catch (error) { next(error); }
}

export async function updateAssetController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateAssetRecord(requireUser(request.user), parseUuid(request.params.assetId), request.body)); } catch (error) { next(error); }
}

export async function deleteAssetController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteAssetRecord(requireUser(request.user), parseUuid(request.params.assetId)); response.status(204).send(); } catch (error) { next(error); }
}

export async function listAssetAllocationsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listAssetAllocationRecords(requireUser(request.user), request.query as { asset_id?: string; project_id?: string })); } catch (error) { next(error); }
}

export async function createAssetAllocationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createAssetAllocationRecord(requireUser(request.user), request.body)); } catch (error) { next(error); }
}

export async function updateAssetAllocationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateAssetAllocationRecord(requireUser(request.user), parseUuid(request.params.allocationId), request.body)); } catch (error) { next(error); }
}

export async function deleteAssetAllocationController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteAssetAllocationRecord(requireUser(request.user), parseUuid(request.params.allocationId)); response.status(204).send(); } catch (error) { next(error); }
}

export async function workloadController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getWorkloadView(requireUser(request.user))); } catch (error) { next(error); }
}

export async function projectAllocationsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getProjectAllocationView(requireUser(request.user), parseUuid(request.params.projectId))); } catch (error) { next(error); }
}

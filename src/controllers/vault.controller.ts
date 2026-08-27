import type { NextFunction, Request, Response } from 'express';
import {
  archiveEntry,
  createEntry,
  deleteEntry,
  getEntry,
  getEntryTags,
  listEntries,
  revealSecret,
  setEntryTags,
  storeSecret,
  updateEntry,
} from '../services/vault.service';
import { parsePositiveId, requireUser } from '../utils/request.util';

export async function listVaultEntriesController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listEntries(requireUser(request.user), request.query as { project_id?: string })); } catch (error) { next(error); }
}

export async function getVaultEntryController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getEntry(requireUser(request.user), parsePositiveId(request.params.entryId))); } catch (error) { next(error); }
}

export async function createVaultEntryController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createEntry(requireUser(request.user), request.body)); } catch (error) { next(error); }
}

export async function updateVaultEntryController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateEntry(requireUser(request.user), parsePositiveId(request.params.entryId), request.body)); } catch (error) { next(error); }
}

export async function archiveVaultEntryController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await archiveEntry(requireUser(request.user), parsePositiveId(request.params.entryId)); response.status(204).send(); } catch (error) { next(error); }
}

export async function deleteVaultEntryController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteEntry(requireUser(request.user), parsePositiveId(request.params.entryId)); response.status(204).send(); } catch (error) { next(error); }
}

export async function getVaultEntryTagsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getEntryTags(requireUser(request.user), parsePositiveId(request.params.entryId))); } catch (error) { next(error); }
}

export async function setVaultEntryTagsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await setEntryTags(requireUser(request.user), parsePositiveId(request.params.entryId), request.body)); } catch (error) { next(error); }
}

export async function revealVaultSecretController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const result = await revealSecret(requireUser(request.user), parsePositiveId(request.params.entryId));
    response.set('Cache-Control', 'no-store');
    response.json(result);
  } catch (error) { next(error); }
}

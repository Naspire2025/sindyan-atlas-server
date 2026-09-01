import type { NextFunction, Request, Response } from 'express';
import { createUploadIntent, deleteFile, downloadFile, finalizeUpload, listEntryFiles, reviewFile } from '../services/vault-file.service';
import { parsePositiveId, requireUser } from '../utils/request.util';

export async function listVaultFilesController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listEntryFiles(requireUser(request.user), parsePositiveId(request.params.entryId))); } catch (error) { next(error); }
}

export async function createUploadIntentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createUploadIntent(requireUser(request.user), parsePositiveId(request.params.entryId), request.body)); } catch (error) { next(error); }
}

export async function finalizeUploadController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await finalizeUpload(requireUser(request.user), parsePositiveId(request.params.fileId), request.body)); } catch (error) { next(error); }
}

export async function downloadFileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await downloadFile(requireUser(request.user), parsePositiveId(request.params.fileId))); } catch (error) { next(error); }
}

export async function reviewFileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await reviewFile(requireUser(request.user), parsePositiveId(request.params.fileId), request.body)); } catch (error) { next(error); }
}

export async function deleteFileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteFile(requireUser(request.user), parsePositiveId(request.params.fileId)); response.status(204).send(); } catch (error) { next(error); }
}

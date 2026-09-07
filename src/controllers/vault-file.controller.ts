import type { NextFunction, Request, Response } from 'express';
import { createUploadIntent, deleteFile, downloadFile, finalizeUpload, getFileContent, listEntryFiles, reviewFile } from '../services/vault-file.service';
import { parseUuid, requireUser } from '../utils/request.util';

export async function listVaultFilesController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listEntryFiles(requireUser(request.user), parseUuid(request.params.entryId))); } catch (error) { next(error); }
}

export async function createUploadIntentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createUploadIntent(requireUser(request.user), parseUuid(request.params.entryId), request.body)); } catch (error) { next(error); }
}

export async function finalizeUploadController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await finalizeUpload(requireUser(request.user), parseUuid(request.params.fileId), request.body)); } catch (error) { next(error); }
}

export async function downloadFileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await downloadFile(requireUser(request.user), parseUuid(request.params.fileId))); } catch (error) { next(error); }
}

export async function getFileContentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const content = await getFileContent(requireUser(request.user), parseUuid(request.params.fileId));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(content.filename)}`);
    if (content.contentLength !== undefined) response.setHeader('Content-Length', String(content.contentLength));
    content.stream.on('error', (error) => {
      if (response.headersSent) response.destroy(error);
      else next(error);
    });
    content.stream.pipe(response);
  } catch (error) {
    next(error);
  }
}

export async function reviewFileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await reviewFile(requireUser(request.user), parseUuid(request.params.fileId), request.body)); } catch (error) { next(error); }
}

export async function deleteFileController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteFile(requireUser(request.user), parseUuid(request.params.fileId)); response.status(204).send(); } catch (error) { next(error); }
}

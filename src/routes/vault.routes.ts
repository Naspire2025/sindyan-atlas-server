import { Router } from 'express';
import {
  archiveVaultEntryController,
  createVaultEntryController,
  deleteVaultEntryController,
  getVaultEntryController,
  getVaultEntryTagsController,
  listVaultEntriesController,
  revealVaultSecretController,
  setVaultEntryTagsController,
  updateVaultEntryController,
} from '../controllers/vault.controller';
import { createUploadIntentController, deleteFileController, downloadFileController, finalizeUploadController, listVaultFilesController } from '../controllers/vault-file.controller';
import { requireAuth } from '../middleware/require-auth.middleware';

export const vaultRouter = Router();
export const vaultFileRouter = Router();

vaultRouter.get('/entries', requireAuth, listVaultEntriesController);
vaultRouter.post('/entries', requireAuth, createVaultEntryController);
vaultRouter.get('/entries/:entryId', requireAuth, getVaultEntryController);
vaultRouter.patch('/entries/:entryId', requireAuth, updateVaultEntryController);
vaultRouter.delete('/entries/:entryId', requireAuth, deleteVaultEntryController);
vaultRouter.put('/entries/:entryId/tags', requireAuth, setVaultEntryTagsController);
vaultRouter.get('/entries/:entryId/tags', requireAuth, getVaultEntryTagsController);
vaultRouter.post('/entries/:entryId/reveal', requireAuth, revealVaultSecretController);
vaultRouter.get('/entries/:entryId/files', requireAuth, listVaultFilesController);
vaultRouter.post('/entries/:entryId/files/upload-intents', requireAuth, createUploadIntentController);

vaultFileRouter.post('/:fileId/finalize', requireAuth, finalizeUploadController);
vaultFileRouter.post('/:fileId/download', requireAuth, downloadFileController);
vaultFileRouter.delete('/:fileId', requireAuth, deleteFileController);

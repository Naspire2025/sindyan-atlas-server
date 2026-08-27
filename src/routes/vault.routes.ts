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
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const vaultRouter = Router();
export const vaultFileRouter = Router();

vaultRouter.get('/entries', requireAuth, listVaultEntriesController);
vaultRouter.post('/entries', requireAuth, requireCsrf, createVaultEntryController);
vaultRouter.get('/entries/:entryId', requireAuth, getVaultEntryController);
vaultRouter.patch('/entries/:entryId', requireAuth, requireCsrf, updateVaultEntryController);
vaultRouter.delete('/entries/:entryId', requireAuth, requireCsrf, deleteVaultEntryController);
vaultRouter.put('/entries/:entryId/tags', requireAuth, requireCsrf, setVaultEntryTagsController);
vaultRouter.get('/entries/:entryId/tags', requireAuth, getVaultEntryTagsController);
vaultRouter.post('/entries/:entryId/reveal', requireAuth, requireCsrf, revealVaultSecretController);
vaultRouter.get('/entries/:entryId/files', requireAuth, listVaultFilesController);
vaultRouter.post('/entries/:entryId/files/upload-intents', requireAuth, requireCsrf, createUploadIntentController);

vaultFileRouter.post('/:fileId/finalize', requireAuth, requireCsrf, finalizeUploadController);
vaultFileRouter.post('/:fileId/download', requireAuth, requireCsrf, downloadFileController);
vaultFileRouter.delete('/:fileId', requireAuth, requireCsrf, deleteFileController);

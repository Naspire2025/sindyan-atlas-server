import { Router } from 'express';
import { dashboardAttentionController, dashboardOverviewController } from '../controllers/dashboard.controller';
import { requireAuth } from '../middleware/require-auth.middleware';

export const dashboardRouter = Router();

dashboardRouter.get('/overview', requireAuth, dashboardOverviewController);
dashboardRouter.get('/attention', requireAuth, dashboardAttentionController);

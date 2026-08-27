import { Router } from 'express';
import {
  createIssueController,
  createRiskController,
  deleteIssueController,
  deleteRiskController,
  listIssuesController,
  listRisksController,
  updateIssueController,
  updateRiskController,
} from '../controllers/risk-issue.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const projectRiskIssueRouter = Router({ mergeParams: true });
export const standaloneRiskRouter = Router();
export const standaloneIssueRouter = Router();

projectRiskIssueRouter.get('/risks', requireAuth, listRisksController);
projectRiskIssueRouter.post('/risks', requireAuth, requireCsrf, createRiskController);
projectRiskIssueRouter.get('/issues', requireAuth, listIssuesController);
projectRiskIssueRouter.post('/issues', requireAuth, requireCsrf, createIssueController);

standaloneRiskRouter.patch('/:riskId', requireAuth, requireCsrf, updateRiskController);
standaloneRiskRouter.delete('/:riskId', requireAuth, requireCsrf, deleteRiskController);

standaloneIssueRouter.patch('/:issueId', requireAuth, requireCsrf, updateIssueController);
standaloneIssueRouter.delete('/:issueId', requireAuth, requireCsrf, deleteIssueController);

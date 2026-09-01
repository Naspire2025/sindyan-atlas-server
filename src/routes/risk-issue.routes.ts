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

export const projectRiskIssueRouter = Router({ mergeParams: true });
export const standaloneRiskRouter = Router();
export const standaloneIssueRouter = Router();

projectRiskIssueRouter.get('/risks', requireAuth, listRisksController);
projectRiskIssueRouter.post('/risks', requireAuth, createRiskController);
projectRiskIssueRouter.get('/issues', requireAuth, listIssuesController);
projectRiskIssueRouter.post('/issues', requireAuth, createIssueController);

standaloneRiskRouter.patch('/:riskId', requireAuth, updateRiskController);
standaloneRiskRouter.delete('/:riskId', requireAuth, deleteRiskController);

standaloneIssueRouter.patch('/:issueId', requireAuth, updateIssueController);
standaloneIssueRouter.delete('/:issueId', requireAuth, deleteIssueController);

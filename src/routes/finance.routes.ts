import { Router } from 'express';
import {
  createBudgetLineController,
  createSpendRecordController,
  deleteBudgetLineController,
  deleteSpendRecordController,
  financialSummaryController,
  listBudgetLinesController,
  listSpendRecordsController,
  updateBudgetLineController,
  updateSpendRecordController,
} from '../controllers/finance.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';

export const projectFinanceRouter = Router({ mergeParams: true });
export const standaloneFinanceRouter = Router();

projectFinanceRouter.get('/budget-lines', requireAuth, listBudgetLinesController);
projectFinanceRouter.post('/budget-lines', requireAuth, requireCsrf, createBudgetLineController);
projectFinanceRouter.get('/spend-records', requireAuth, listSpendRecordsController);
projectFinanceRouter.post('/spend-records', requireAuth, requireCsrf, createSpendRecordController);
projectFinanceRouter.get('/financial-summary', requireAuth, financialSummaryController);

standaloneFinanceRouter.patch('/budget-lines/:id', requireAuth, requireCsrf, updateBudgetLineController);
standaloneFinanceRouter.delete('/budget-lines/:id', requireAuth, requireCsrf, deleteBudgetLineController);
standaloneFinanceRouter.patch('/spend-records/:id', requireAuth, requireCsrf, updateSpendRecordController);
standaloneFinanceRouter.delete('/spend-records/:id', requireAuth, requireCsrf, deleteSpendRecordController);

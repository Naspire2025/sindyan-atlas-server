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

export const projectFinanceRouter = Router({ mergeParams: true });
export const standaloneFinanceRouter = Router();

projectFinanceRouter.get('/budget-lines', requireAuth, listBudgetLinesController);
projectFinanceRouter.post('/budget-lines', requireAuth, createBudgetLineController);
projectFinanceRouter.get('/spend-records', requireAuth, listSpendRecordsController);
projectFinanceRouter.post('/spend-records', requireAuth, createSpendRecordController);
projectFinanceRouter.get('/financial-summary', requireAuth, financialSummaryController);

standaloneFinanceRouter.patch('/budget-lines/:id', requireAuth, updateBudgetLineController);
standaloneFinanceRouter.delete('/budget-lines/:id', requireAuth, deleteBudgetLineController);
standaloneFinanceRouter.patch('/spend-records/:id', requireAuth, updateSpendRecordController);
standaloneFinanceRouter.delete('/spend-records/:id', requireAuth, deleteSpendRecordController);

import type { NextFunction, Request, Response } from 'express';
import {
  createBudgetLineRecord,
  createSpendRecordRecord,
  deleteBudgetLineRecord,
  deleteSpendRecordRecord,
  getFinancialSummary,
  listBudgetLines,
  listSpendRecords,
  updateBudgetLineRecord,
  updateSpendRecordRecord,
} from '../services/finance.service';
import { parsePositiveId, requireUser } from '../utils/request.util';

function projectId(request: Request): number { return parsePositiveId(request.params.projectId); }

export async function listBudgetLinesController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listBudgetLines(requireUser(request.user), projectId(request))); } catch (error) { next(error); }
}

export async function createBudgetLineController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createBudgetLineRecord(requireUser(request.user), projectId(request), request.body)); } catch (error) { next(error); }
}

export async function updateBudgetLineController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateBudgetLineRecord(requireUser(request.user), parsePositiveId(request.params.id), request.body)); } catch (error) { next(error); }
}

export async function deleteBudgetLineController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteBudgetLineRecord(requireUser(request.user), parsePositiveId(request.params.id)); response.status(204).send(); } catch (error) { next(error); }
}

export async function listSpendRecordsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listSpendRecords(requireUser(request.user), projectId(request))); } catch (error) { next(error); }
}

export async function createSpendRecordController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createSpendRecordRecord(requireUser(request.user), projectId(request), request.body)); } catch (error) { next(error); }
}

export async function updateSpendRecordController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateSpendRecordRecord(requireUser(request.user), parsePositiveId(request.params.id), request.body)); } catch (error) { next(error); }
}

export async function deleteSpendRecordController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteSpendRecordRecord(requireUser(request.user), parsePositiveId(request.params.id)); response.status(204).send(); } catch (error) { next(error); }
}

export async function financialSummaryController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getFinancialSummary(requireUser(request.user), projectId(request))); } catch (error) { next(error); }
}

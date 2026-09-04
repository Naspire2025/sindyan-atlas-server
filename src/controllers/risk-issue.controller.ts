import type { NextFunction, Request, Response } from 'express';
import {
  createIssueRecord,
  createRiskRecord,
  deleteIssueRecord,
  deleteRiskRecord,
  listAllProjectIssues,
  listAllProjectRisks,
  listProjectIssues,
  listProjectRisks,
  updateIssueRecord,
  updateRiskRecord,
} from '../services/risk-issue.service';
import { parseUuid, requireUser } from '../utils/request.util';

function projectId(request: Request): string { return parseUuid(request.params.projectId); }

export async function listAllRisksController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listAllProjectRisks(requireUser(request.user))); } catch (error) { next(error); }
}

export async function listAllIssuesController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listAllProjectIssues(requireUser(request.user))); } catch (error) { next(error); }
}

export async function listRisksController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listProjectRisks(requireUser(request.user), projectId(request))); } catch (error) { next(error); }
}

export async function createRiskController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createRiskRecord(requireUser(request.user), projectId(request), request.body)); } catch (error) { next(error); }
}

export async function updateRiskController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateRiskRecord(requireUser(request.user), parseUuid(request.params.riskId), request.body)); } catch (error) { next(error); }
}

export async function deleteRiskController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteRiskRecord(requireUser(request.user), parseUuid(request.params.riskId)); response.status(204).send(); } catch (error) { next(error); }
}

export async function listIssuesController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await listProjectIssues(requireUser(request.user), projectId(request))); } catch (error) { next(error); }
}

export async function createIssueController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json(await createIssueRecord(requireUser(request.user), projectId(request), request.body)); } catch (error) { next(error); }
}

export async function updateIssueController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await updateIssueRecord(requireUser(request.user), parseUuid(request.params.issueId), request.body)); } catch (error) { next(error); }
}

export async function deleteIssueController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { await deleteIssueRecord(requireUser(request.user), parseUuid(request.params.issueId)); response.status(204).send(); } catch (error) { next(error); }
}
